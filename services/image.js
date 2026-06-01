const storage = require('./storage');

const MAX_IMAGES = 3;
const TARGET_IMAGE_SIZE = 200 * 1024;

function chooseImages(currentCount = 0) {
  const count = Math.max(0, MAX_IMAGES - currentCount);
  if (count === 0) {
    return Promise.resolve([]);
  }
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (result) => resolve((result.tempFiles || []).map((file) => file.tempFilePath)),
      fail: reject
    });
  });
}

function compressImage(src) {
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: 55,
      success: (result) => resolve(result.tempFilePath),
      fail: () => resolve(src)
    });
  });
}

async function uploadImage(taskId, src) {
  if (!wx.cloud) {
    return { ok: false, reason: 'cloud_unavailable', src };
  }
  try {
    const compressed = await compressImage(src);
    const ext = compressed.split('.').pop() || 'jpg';
    const cloudPath = `tasks/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const result = await wx.cloud.uploadFile({ cloudPath, filePath: compressed });
    return { ok: true, fileID: result.fileID, src };
  } catch (error) {
    return { ok: false, reason: error.message || 'upload_failed', src };
  }
}

async function uploadPendingImages(task) {
  const localImages = (task.localImages || []).slice();
  const imageFileIds = (task.imageFileIds || []).slice();
  const results = await Promise.all(localImages.map((image) => {
    if (image.status === 'uploaded') {
      return Promise.resolve({ image });
    }
    return uploadImage(task.id, image.src).then((result) => ({ image, result }));
  }));
  results.forEach((entry, index) => {
    if (!entry.result) {
      return;
    }
    if (entry.result.ok) {
      localImages[index] = { ...localImages[index], status: 'uploaded', fileID: entry.result.fileID };
      if (!imageFileIds.includes(entry.result.fileID)) {
        imageFileIds.push(entry.result.fileID);
      }
    } else {
      localImages[index] = { ...localImages[index], status: 'failed' };
    }
  });
  return storage.updateTask(task.id, { localImages, imageFileIds }) || task;
}

module.exports = {
  MAX_IMAGES,
  TARGET_IMAGE_SIZE,
  chooseImages,
  compressImage,
  uploadImage,
  uploadPendingImages
};
