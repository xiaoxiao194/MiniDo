const { validateTaskInput, TAG_COLORS } = require('../../utils/taskCore');
const storage = require('../../services/storage');
const cloud = require('../../services/cloud');
const imageService = require('../../services/image');
const reminder = require('../../services/reminder');

Page({
  data: {
    id: '',
    task: null,
    title: '',
    detail: '',
    dueDate: '',
    reminderDate: '',
    reminderTime: '',
    tagsText: '',
    tags: [],
    tagColors: colorOptions(),
    localImages: [],
    imageFileIds: [],
    syncStatus: 'pending',
    reminderStatus: 'none'
  },

  onLoad(options) {
    this.loadTask(options.id);
  },

  loadTask(id) {
    const task = storage.getTasks().find((item) => item.id === id);
    if (!task) {
      wx.showToast({ title: '任务不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    const reminderParts = splitReminder(task.reminderAt);
    this.setData({
      id,
      task,
      title: task.title,
      detail: task.detail || '',
      dueDate: task.dueDate || '',
      reminderDate: reminderParts.date,
      reminderTime: reminderParts.time,
      tagsText: normalizeTags(task.tags || []).map((tag) => tag.name).join(' '),
      tags: normalizeTags(task.tags || []),
      localImages: task.localImages || [],
      imageFileIds: task.imageFileIds || [],
      syncStatus: task.syncStatus || 'pending',
      reminderStatus: task.reminderStatus || 'none'
    });
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
    if (event.currentTarget.dataset.field === 'tagsText') {
      this.setData({ tags: parseTags(event.detail.value, this.data.tags) });
    }
  },

  async chooseImages() {
    try {
      const currentCount = this.data.localImages.length + this.data.imageFileIds.length;
      const paths = await imageService.chooseImages(currentCount);
      const newImages = paths.map((src) => ({ src, status: 'pending' }));
      this.setData({ localImages: this.data.localImages.concat(newImages).slice(0, 3) });
    } catch (error) {
      wx.showToast({ title: '未选择图片', icon: 'none' });
    }
  },

  removeLocalImage(event) {
    const localImages = this.data.localImages.slice();
    localImages.splice(event.currentTarget.dataset.index, 1);
    this.setData({ localImages });
  },

  removeCloudImage(event) {
    const imageFileIds = this.data.imageFileIds.slice();
    imageFileIds.splice(event.currentTarget.dataset.index, 1);
    this.setData({ imageFileIds });
  },

  setTagColor(event) {
    const index = event.currentTarget.dataset.tagIndex;
    const tags = this.data.tags.slice();
    if (!tags[index]) {
      return;
    }
    tags[index] = { ...tags[index], color: event.currentTarget.dataset.color };
    this.setData({ tags });
  },

  previewImage(event) {
    const url = event.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.imageFileIds.concat(this.data.localImages.map((image) => image.src))
    });
  },

  async saveTask() {
    const reminderAt = buildReminderAt(this.data.reminderDate, this.data.reminderTime);
    const patch = {
      title: this.data.title,
      detail: this.data.detail,
      dueDate: this.data.dueDate,
      reminderAt,
      tags: parseTags(this.data.tagsText, this.data.tags),
      localImages: this.data.localImages,
      imageFileIds: this.data.imageFileIds
    };
    const errors = validateTaskInput(patch, new Date());
    if (errors.length) {
      wx.showToast({ title: errors[0], icon: 'none' });
      return;
    }
    const updated = storage.updateTask(this.data.id, patch);
    this.setData({ syncStatus: 'pending' });
    wx.showToast({ title: '已保存', icon: 'success' });
    if (updated) {
      await this.finishBackgroundWork(updated);
      this.loadTask(this.data.id);
    }
  },

  async finishBackgroundWork(task) {
    let nextTask = task;
    if (task.reminderAt && storage.getSettings().remindersEnabled !== false) {
      const confirmed = await reminder.explainReminderAuth();
      const auth = confirmed ? await reminder.requestReminderAuth() : { ok: false };
      if (auth.ok) {
        const job = await reminder.createReminderJob(task);
        nextTask = storage.updateTask(task.id, { reminderStatus: job.ok ? 'enabled' : 'failed' }) || task;
      } else {
        nextTask = storage.updateTask(task.id, { reminderStatus: 'local_only' }) || task;
        wx.showToast({ title: '提醒将仅在打开小程序时提示', icon: 'none' });
      }
    } else if (task.reminderAt) {
      nextTask = storage.updateTask(task.id, { reminderStatus: 'local_only' }) || task;
    }
    if (nextTask.localImages && nextTask.localImages.some((image) => image.status !== 'uploaded')) {
      nextTask = await uploadPendingImages(nextTask);
    }
    await cloud.syncTask(nextTask);
  },

  retryUpload() {
    if (this.data.task) {
      this.finishBackgroundWork(this.data.task).then(() => this.loadTask(this.data.id));
    }
  },

  retryReminder() {
    if (this.data.task) {
      this.finishBackgroundWork(this.data.task).then(() => this.loadTask(this.data.id));
    }
  },

  toggleComplete() {
    const completedAt = this.data.task.completedAt ? '' : new Date().toISOString();
    const updated = storage.updateTask(this.data.id, { completedAt });
    if (updated) {
      cloud.syncTask(updated);
      this.loadTask(this.data.id);
    }
  },

  confirmDelete() {
    wx.showModal({
      title: '删除待办',
      content: '删除后列表中将不再显示，确定删除吗？',
      confirmColor: '#dc2626',
      success: (result) => {
        if (!result.confirm) {
          return;
        }
        const updated = storage.updateTask(this.data.id, { deletedAt: new Date().toISOString() });
        if (updated) {
          cloud.syncTask(updated);
        }
        wx.navigateBack();
      }
    });
  }
});

async function uploadPendingImages(task) {
  const localImages = (task.localImages || []).slice();
  const imageFileIds = (task.imageFileIds || []).slice();
  for (let index = 0; index < localImages.length; index += 1) {
    if (localImages[index].status === 'uploaded') {
      continue;
    }
    const result = await imageService.uploadImage(task.id, localImages[index].src);
    if (result.ok) {
      localImages[index] = { ...localImages[index], status: 'uploaded', fileID: result.fileID };
      if (!imageFileIds.includes(result.fileID)) {
        imageFileIds.push(result.fileID);
      }
    } else {
      localImages[index] = { ...localImages[index], status: 'failed' };
    }
  }
  return storage.updateTask(task.id, { localImages, imageFileIds }) || task;
}

function splitReminder(value) {
  if (!value) {
    return { date: '', time: '' };
  }
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16)
  };
}

function buildReminderAt(date, time) {
  if (!date) {
    return '';
  }
  return `${date}T${time || '09:00'}:00+08:00`;
}

function parseTags(value, previousTags = []) {
  const previous = normalizeTags(previousTags);
  return String(value || '')
    .split(/[\s,，#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 3)
    .map((name) => {
      const old = previous.find((tag) => tag.name === name);
      return { name, color: old ? old.color : TAG_COLORS.blue };
    });
}

function normalizeTags(tags) {
  return (tags || []).map((tag) => {
    if (typeof tag === 'string') {
      return { name: tag, color: TAG_COLORS.blue };
    }
    return { name: tag.name, color: tag.color || TAG_COLORS.blue };
  });
}

function colorOptions() {
  return Object.keys(TAG_COLORS).map((name) => ({ name, color: TAG_COLORS[name] }));
}
