const storage = require('../../services/storage');

Page({
  acceptPrivacy() {
    storage.acceptPrivacy();
    wx.showToast({ title: '已同意', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 300);
  }
});
