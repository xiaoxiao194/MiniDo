const {
  getTaskStats,
  exportTasksAsJson,
  copyTasksText,
  TAG_COLORS
} = require('../../utils/taskCore');
const storage = require('../../services/storage');

Page({
  data: {
    avatarUrl: '',
    nickName: 'MiniDo 用户',
    total: 0,
    completed: 0,
    completionRate: 0,
    tags: [],
    newTagName: '',
    newTagColor: TAG_COLORS.blue,
    tagColors: Object.keys(TAG_COLORS).map((name) => ({ name, color: TAG_COLORS[name] })),
    remindersEnabled: true
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const stats = getTaskStats(storage.getTasks());
    const settings = storage.getSettings();
    this.setData({
      total: stats.total,
      completed: stats.completed,
      completionRate: stats.completionRate,
      tags: storage.getTags(),
      remindersEnabled: settings.remindersEnabled !== false
    });
  },

  chooseAvatar(event) {
    this.setData({ avatarUrl: event.detail.avatarUrl });
  },

  onNickNameInput(event) {
    this.setData({ nickName: event.detail.value || 'MiniDo 用户' });
  },

  onNewTagInput(event) {
    this.setData({ newTagName: event.detail.value });
  },

  setNewTagColor(event) {
    this.setData({ newTagColor: event.currentTarget.dataset.color });
  },

  addTag() {
    const name = this.data.newTagName.trim();
    if (!name) {
      wx.showToast({ title: '请输入标签名', icon: 'none' });
      return;
    }
    const tags = storage.getTags().filter((tag) => tag.name !== name);
    tags.push({ name, color: this.data.newTagColor });
    storage.saveTags(tags);
    this.setData({ newTagName: '', newTagColor: TAG_COLORS.blue });
    this.refresh();
  },

  deleteTag(event) {
    const name = event.currentTarget.dataset.name;
    storage.saveTags(storage.getTags().filter((tag) => tag.name !== name));
    this.refresh();
  },

  toggleReminders(event) {
    const settings = storage.getSettings();
    settings.remindersEnabled = event.detail.value;
    storage.saveSettings(settings);
    this.setData({ remindersEnabled: event.detail.value });
  },

  copyJson() {
    this.copy(exportTasksAsJson(storage.getTasks()));
  },

  copyAllUnfinished() {
    this.copy(copyTasksText(storage.getTasks(), { scope: 'unfinished' }));
  },

  copyToday() {
    this.copy(copyTasksText(storage.getTasks(), { scope: 'today', now: new Date() }));
  },

  copy(text) {
    wx.setClipboardData({
      data: text || '',
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  openWeekly() {
    wx.navigateTo({ url: '/pages/weekly/weekly' });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  showAbout() {
    wx.showModal({
      title: '关于 MiniDo',
      content: 'MiniDo 是一个极简个人待办小程序，帮助你记录、提醒、完成和回顾自己的事情。',
      showCancel: false
    });
  }
});
