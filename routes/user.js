const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// 配置头像上传存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../avatars'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});

// 文件过滤器，只允许图片文件
const fileFilter = (req, file, cb) => {
  // 允许的文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件 (jpg, png, gif, webp, svg)'), false);
  }
};

// 配置 multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制5MB
  }
});

// 所有路由都需要登录
router.use(protect);

// 获取所有用户
router.get('/', userController.getAllUsers);

// 搜索用户
router.get('/search', userController.searchUsers);

// 获取好友列表
router.get('/friends', userController.getFriends);

// 发送好友请求
router.post('/friend-request', userController.sendFriendRequest);

// 获取待处理的好友请求
router.get('/friend-requests', userController.getPendingFriendRequests);

// 接受好友请求
router.post('/friend-request/accept', userController.acceptFriendRequest);

// 拒绝好友请求
router.post('/friend-request/reject', userController.rejectFriendRequest);

// 删除好友
router.delete('/friends/:friendId', userController.removeFriend);

// 修改好友备注
router.patch('/friends/:friendId/remark', userController.updateFriendRemark);

// 上传用户头像
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);

// 获取单个用户
router.get('/:id', userController.getUser);

// 更新用户信息
router.patch('/update', userController.updateUser);

module.exports = router;