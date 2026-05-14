const { generateWeeklyReport } = require('../../utils/taskCore');
const storage = require('../../services/storage');

Page({
  data: {
    completedCount: 0,
    unfinishedCount: 0,
    completionRate: 0,
    groups: [],
    followUps: [],
    reportText: ''
  },

  onShow() {
    this.buildReport();
  },

  buildReport() {
    const report = generateWeeklyReport(storage.getTasks(), new Date());
    const groups = Object.keys(report.grouped).map((tag) => ({
      tag,
      tasks: report.grouped[tag]
    }));
    this.setData({
      completedCount: report.completedCount,
      unfinishedCount: report.unfinishedCount,
      completionRate: report.completionRate,
      groups,
      followUps: report.followUps,
      reportText: report.text
    });
  },

  copyReport() {
    wx.setClipboardData({
      data: this.data.reportText,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  }
});
