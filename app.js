App({
  globalData: {
    openid: '',
    cloudReady: false
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'YOUR_CLOUDBASE_ENV_ID',
        traceUser: true
      });
      this.globalData.cloudReady = true;
    }
  }
});
