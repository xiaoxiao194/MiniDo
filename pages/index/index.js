const {
  createTask,
  validateTaskInput,
  getTodayView,
  getAllView,
  getRecentTags,
  postponeTaskByDays,
  pinTask,
  updateTaskSortOrder,
  getDateKey,
  TAG_COLORS
} = require('../../utils/taskCore');
const storage = require('../../services/storage');
const cloud = require('../../services/cloud');
const imageService = require('../../services/image');
const reminder = require('../../services/reminder');

Page({
  data: {
    activeTab: 'today',
    tasks: [],
    todayActive: [],
    todayOverdue: [],
    todayOlderOverdue: [],
    todayCompleted: [],
    allActive: [],
    allStaleOverdue: [],
    allCompleted: [],
    overdueExpanded: false,
    olderExpanded: false,
    completedExpanded: false,
    quickTitle: '',
    showAdvanced: false,
    detail: '',
    dueDate: '',
    reminderDate: '',
    reminderTime: '',
    tagsText: '',
    advancedImages: [],
    recentTags: [],
    selectedTag: ''
  },

  onLoad() {
    this.ensurePrivacy();
    this.loadTasks();
    this.syncSilently();
    this.checkLocalReminders();
  },

  onShow() {
    this.loadTasks();
  },

  onPullDownRefresh() {
    this.syncSilently().finally(() => wx.stopPullDownRefresh());
  },

  ensurePrivacy() {
    if (storage.hasAcceptedPrivacy()) {
      return;
    }
    wx.showModal({
      title: 'MiniDo 隐私保护指引',
      content: 'MiniDo 会使用 openid、任务数据和图片用于同步与提醒。继续使用表示你已阅读并同意隐私保护指引。',
      confirmText: '同意',
      cancelText: '查看',
      success: (result) => {
        if (result.confirm) {
          storage.acceptPrivacy();
        } else {
          wx.navigateTo({ url: '/pages/privacy/privacy' });
        }
      }
    });
  },

  async syncSilently() {
    const app = getApp();
    const openid = app.globalData.openid || await cloud.getOpenId();
    app.globalData.openid = openid;
    if (openid) {
      await cloud.syncAll();
      this.loadTasks();
    }
  },

  loadTasks() {
    const tasks = storage.getTasks();
    const today = getTodayView(tasks, new Date());
    const all = getAllView(tasks, { tag: this.data.selectedTag, now: new Date() });
    this.setData({
      tasks,
      todayActive: today.active.map(decorateTask),
      todayOverdue: today.overdue.map(decorateTask),
      todayOlderOverdue: today.olderOverdue.map(decorateTask),
      todayCompleted: today.completed.map(decorateTask),
      allActive: all.active.map(decorateTask),
      allStaleOverdue: all.staleOverdue.map(decorateTask),
      allCompleted: all.completed.map(decorateTask),
      recentTags: getRecentTags(tasks, 5)
    });
  },

  switchTab(event) {
    this.setData({
      activeTab: event.currentTarget.dataset.tab,
      completedExpanded: false
    });
    this.loadTasks();
  },

  onQuickTitleInput(event) {
    this.setData({ quickTitle: event.detail.value });
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
  },

  toggleOlder() {
    this.setData({ olderExpanded: !this.data.olderExpanded });
  },

  toggleOverdue() {
    this.setData({ overdueExpanded: !this.data.overdueExpanded });
  },

  toggleCompleted() {
    this.setData({ completedExpanded: !this.data.completedExpanded });
  },

  async chooseImages() {
    try {
      const paths = await imageService.chooseImages(this.data.advancedImages.length);
      this.setData({ advancedImages: this.data.advancedImages.concat(paths).slice(0, 3) });
    } catch (error) {
      wx.showToast({ title: '未选择图片', icon: 'none' });
    }
  },

  removeImage(event) {
    const index = event.currentTarget.dataset.index;
    const advancedImages = this.data.advancedImages.slice();
    advancedImages.splice(index, 1);
    this.setData({ advancedImages });
  },

  selectRecentTag(event) {
    const tag = event.currentTarget.dataset.tag;
    const tags = parseTags(this.data.tagsText);
    if (!tags.some((item) => item.name === tag) && tags.length < 3) {
      tags.push({ name: tag, color: TAG_COLORS.blue });
    }
    this.setData({ tagsText: tags.map((item) => item.name || item).join(' ') });
  },

  setTagFilter(event) {
    const tag = event.currentTarget.dataset.tag || '';
    this.setData({ selectedTag: tag });
    this.loadTasks();
  },

  async addTask() {
    const reminderAt = buildReminderAt(this.data.reminderDate, this.data.reminderTime);
    const input = {
      title: this.data.quickTitle,
      detail: this.data.detail,
      dueDate: this.data.dueDate,
      reminderAt,
      tags: parseTags(this.data.tagsText),
      localImages: this.data.advancedImages.map((src) => ({ src, status: 'pending' }))
    };
    const errors = validateTaskInput(input, new Date());
    if (errors.length) {
      wx.showToast({ title: errors[0], icon: 'none' });
      return;
    }

    const app = getApp();
    const openid = app.globalData.openid || await cloud.getOpenId();
    app.globalData.openid = openid;
    const task = createTask({
      ...input,
      openid,
      now: new Date()
    });
    storage.upsertTask(task);
    this.resetForm();
    this.loadTasks();
    wx.showToast({ title: '已添加', icon: 'success' });
    this.finishBackgroundWork(task);
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
    if (task.localImages && task.localImages.length) {
      nextTask = await imageService.uploadPendingImages(nextTask);
    }
    await cloud.syncTask(nextTask);
    this.loadTasks();
  },

  resetForm() {
    this.setData({
      quickTitle: '',
      detail: '',
      dueDate: '',
      reminderDate: '',
      reminderTime: '',
      tagsText: '',
      advancedImages: [],
      showAdvanced: false
    });
  },

  openTask(event) {
    wx.navigateTo({ url: `/pages/edit/edit?id=${event.currentTarget.dataset.id}` });
  },

  toggleComplete(event) {
    const id = event.currentTarget.dataset.id;
    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    const completedAt = task.completedAt ? '' : new Date().toISOString();
    const updated = storage.updateTask(id, { completedAt });
    this.loadTasks();
    if (updated) {
      cloud.syncTask(updated);
    }
  },

  showTaskActions(event) {
    const id = event.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['置顶/取消置顶', '明天再说', '改为今天', '改为明天', '完成'],
      success: (result) => {
        const actions = [this.togglePinTask, this.postponeTomorrow, this.moveToToday, this.moveToTomorrow, this.completeTask];
        actions[result.tapIndex].call(this, id);
      }
    });
  },

  togglePinTask(eventOrId) {
    const id = typeof eventOrId === 'string' ? eventOrId : eventOrId.currentTarget.dataset.id;
    const task = this.findTask(id);
    if (!task) return;
    this.persistTask(pinTask(task, !task.isPinned, new Date()));
  },

  postponeTomorrow(eventOrId) {
    const id = typeof eventOrId === 'string' ? eventOrId : eventOrId.currentTarget.dataset.id;
    const task = this.findTask(id);
    if (!task) return;
    this.persistTask(postponeTaskByDays(task, 1, new Date()));
  },

  moveToToday(eventOrId) {
    const id = typeof eventOrId === 'string' ? eventOrId : eventOrId.currentTarget.dataset.id;
    const task = this.findTask(id);
    if (!task) return;
    const today = getDateKey(new Date());
    this.persistTask({
      ...task,
      dueDate: today,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    });
  },

  moveToTomorrow(eventOrId) {
    const id = typeof eventOrId === 'string' ? eventOrId : eventOrId.currentTarget.dataset.id;
    const task = this.findTask(id);
    if (!task) return;
    const tomorrow = getDateKey(new Date(Date.now() + 86400000));
    this.persistTask({
      ...task,
      dueDate: tomorrow,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    });
  },

  completeTask(eventOrId) {
    const id = typeof eventOrId === 'string' ? eventOrId : eventOrId.currentTarget.dataset.id;
    const task = this.findTask(id);
    if (!task) return;
    this.persistTask({
      ...task,
      completedAt: task.completedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    });
  },

  moveTaskUp(event) {
    const id = event.currentTarget.dataset.id;
    this.adjustSort(id, -1);
  },

  moveTaskDown(event) {
    const id = event.currentTarget.dataset.id;
    this.adjustSort(id, 1);
  },

  adjustSort(id, delta) {
    const task = this.findTask(id);
    if (!task) return;
    const current = Number(task.sortOrder || 0);
    this.persistTask(updateTaskSortOrder(task, current + delta, new Date()));
  },

  findTask(id) {
    return storage.getTasks().find((task) => task.id === id);
  },

  persistTask(task) {
    storage.upsertTask(task);
    this.loadTasks();
    cloud.syncTask(task);
  },

  openWeekly() {
    wx.navigateTo({ url: '/pages/weekly/weekly' });
  },

  openMine() {
    wx.navigateTo({ url: '/pages/mine/mine' });
  },

  checkLocalReminders() {
    const now = new Date();
    const dueTasks = storage.getTasks().filter((task) => {
      return !task.completedAt &&
        !task.deletedAt &&
        task.reminderStatus === 'local_only' &&
        task.reminderAt &&
        new Date(task.reminderAt).getTime() <= now.getTime() &&
        !task.localReminderShownAt;
    });
    if (!dueTasks.length) {
      return;
    }
    wx.showModal({
      title: '本地提醒',
      content: dueTasks.map((task) => task.title).join('\n'),
      showCancel: false
    });
    dueTasks.forEach((task) => {
      storage.updateTask(task.id, { localReminderShownAt: now.toISOString() });
    });
  }
});

function decorateTask(task) {
  return {
    ...task,
    detailExcerpt: task.detail ? task.detail.slice(0, 32) : '',
    hasImages: (task.imageFileIds && task.imageFileIds.length) || (task.localImages && task.localImages.length),
    tags: normalizeDisplayTags(task.tags),
    isOverdue: task.dueDate && task.dueDate < getDateKey(new Date()),
    isDueToday: task.dueDate === getDateKey(new Date()),
    timeText: [task.dueDate ? `截止 ${task.dueDate}` : '', formatReminder(task.reminderAt)].filter(Boolean).join(' · ')
  };
}

function buildReminderAt(date, time) {
  if (!date) {
    return '';
  }
  return `${date}T${time || '09:00'}:00+08:00`;
}

function formatReminder(value) {
  if (!value) {
    return '';
  }
  return `提醒 ${value.slice(0, 16).replace('T', ' ')}`;
}

function parseTags(value) {
  return String(value || '')
    .split(/[\s,，#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 3)
    .map((name) => ({ name, color: TAG_COLORS.blue }));
}

function normalizeDisplayTags(tags) {
  return (tags || []).map((tag) => {
    if (typeof tag === 'string') {
      return { name: tag, color: TAG_COLORS.blue };
    }
    return {
      name: tag.name,
      color: tag.color || TAG_COLORS.blue
    };
  });
}
