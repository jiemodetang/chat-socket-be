const express = require('express');
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// 所有路由都需要登录
router.use(protect);

// 获取用户的所有聊天
router.get('/', chatController.getUserChats);

// 创建或访问单聊
router.post('/', chatController.accessChat);

// 创建群聊
router.post('/group', chatController.createGroupChat);

// 重命名群聊
router.put('/group/rename', chatController.renameGroupChat);

// 添加用户到群聊
router.put('/group/add', chatController.addToGroupChat);

// 从群聊中移除用户
router.put('/group/remove', chatController.removeFromGroupChat);

// 获取聊天消息
router.get('/:chatId/messages', chatController.getChatMessages);

// 发送消息
router.post('/message', chatController.sendMessage);

// 设置存储方式
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 允许的文件类型
  const allowedTypes = {
    'image': ['image/jpeg', 'image/png', 'image/gif'],
    'audio': ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'],
    'document': [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ],
    'video': [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/webm'
    ]
  };

  // 检查文件类型是否在允许列表中
  const isAllowed = Object.values(allowedTypes).some(types => types.includes(file.mimetype));
  
  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型。允许的类型包括：图片(jpg, png, gif)、音频(mp3, wav, ogg, m4a)、文档(pdf, doc, docx, xls, xlsx, txt)和视频(mp4, mov, avi, wmv, webm)'), false);
  }
};

// 配置 multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 增加到 50MB 限制
  }
});

// 统一文件上传接口
router.post('/upload', upload.single('file'), chatController.uploadFile);

module.exports = router;