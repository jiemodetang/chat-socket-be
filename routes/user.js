const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// 所有路由都需要登录
router.use(protect);

// 获取所有用户
router.get('/', userController.getAllUsers);

// 搜索用户
router.get('/search', userController.searchUsers);

// 获取好友列表
router.get('/friends', userController.getFriends);

// 添加好友
router.post('/friends', userController.addFriend);

// 删除好友
router.delete('/friends/:friendId', userController.removeFriend);

// 获取单个用户
router.get('/:id', userController.getUser);

// 更新用户信息
router.patch('/update', userController.updateUser);

module.exports = router;