const express = require('express');
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

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
    'audio': ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a']
  };

  // 根据上传类型检查文件类型
  const uploadType = req.path.includes('audio') ? 'audio' : 'image';
  if (allowedTypes[uploadType].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型。允许的类型: ${allowedTypes[uploadType].join(', ')}`), false);
  }
};

// 配置 multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
  }
});

// 聊天图片上传接口
router.post('/upload-image', upload.single('image'), chatController.uploadChatImage);

// 聊天音频上传接口
router.post('/upload-audio', upload.single('audio'), chatController.uploadChatAudio);

module.exports = router;