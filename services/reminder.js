const TEMPLATE_ID = '';

function canRequestReminder() {
  return Boolean(TEMPLATE_ID && wx.requestSubscribeMessage);
}

async function requestReminderAuth() {
  if (!canRequestReminder()) {
    return { ok: false, reason: 'template_missing' };
  }
  try {
    const result = await wx.requestSubscribeMessage({ tmplIds: [TEMPLATE_ID] });
    return { ok: result[TEMPLATE_ID] === 'accept', result };
  } catch (error) {
    return { ok: false, reason: error.message || 'auth_failed' };
  }
}

function explainReminderAuth() {
  return new Promise((resolve) => {
    wx.showModal({
      title: '开启提醒',
      content: '开启提醒需要授权通知权限，每次设置提醒需要授权一次',
      confirmText: '继续',
      success: (result) => resolve(Boolean(result.confirm))
    });
  });
}

async function createReminderJob(task) {
  if (!wx.cloud || !task.reminderAt) {
    return { ok: false, reason: 'cloud_unavailable' };
  }
  try {
    const db = wx.cloud.database();
    await db.collection('reminder_jobs').doc(task.id).set({
      data: {
        taskId: task.id,
        openid: task.openid,
        title: task.title,
        reminderAt: task.reminderAt,
        status: 'pending',
        updatedAt: new Date().toISOString()
      }
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message || 'job_failed' };
  }
}

module.exports = {
  explainReminderAuth,
  requestReminderAuth,
  createReminderJob
};
