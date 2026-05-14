const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const TEMPLATE_ID = process.env.REMINDER_TEMPLATE_ID || '';

exports.main = async () => {
  if (!TEMPLATE_ID) {
    return { sent: 0, skipped: true, reason: 'template_missing' };
  }

  const now = new Date().toISOString();
  const result = await db.collection('reminder_jobs')
    .where({
      status: 'pending',
      reminderAt: db.command.lte(now)
    })
    .limit(20)
    .get();

  let sent = 0;
  for (const job of result.data) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: job.openid,
        templateId: TEMPLATE_ID,
        page: `pages/edit/edit?id=${job.taskId}`,
        data: {
          thing1: { value: job.title.slice(0, 20) },
          time2: { value: formatTime(job.reminderAt) }
        }
      });
      await db.collection('reminder_jobs').doc(job._id).update({
        data: {
          status: 'sent',
          sentAt: now
        }
      });
      sent += 1;
    } catch (error) {
      await db.collection('reminder_jobs').doc(job._id).update({
        data: {
          status: 'failed',
          failedReason: error.message || 'send_failed',
          updatedAt: now
        }
      });
    }
  }

  return { sent };
};

function formatTime(value) {
  return String(value || '').slice(0, 16).replace('T', ' ');
}
