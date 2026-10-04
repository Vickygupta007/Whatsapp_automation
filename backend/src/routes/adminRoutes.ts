import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';

const router = Router();

router.get('/metrics', AdminController.getMetrics);
router.get('/messages', AdminController.getMessages);
router.get('/messages/:messageId/details', AdminController.getMessageDetails);
router.get('/orders', AdminController.getOrders);
router.get('/stores', AdminController.getStores);
router.post('/simulate', AdminController.simulateMessage);

export default router;
