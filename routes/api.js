import { Router } from "express";
import { handleFileUpload } from "../fileUpload.js";
import multer from "multer";
import { apiAuthorization } from '../middleware/apiAuthorizationMiddleware.js';
import { apiAuthentication } from '../middleware/apiAuthenticationMiddleware.js';

import { clubList, clubDetail } from '../controller/api/ClubController.js';
import { shopList, shopDetail } from '../controller/api/ShopController.js';
import { offerList, offerDetail, offerHistory } from '../controller/api/OfferController.js';
import { redeemCoupon, createIntent, createPortableChargerSubscription, addCardToCustomer, customerCardsList, removeCard, autoPay, getPaymentSession, savedcardPayment  } from '../controller/PaymentController.js';
import { carList, carDetail } from '../controller/api/ElectricCarRentalController.js';
import { bikeList, bikeDetail } from '../controller/api/ElectricBikeRentalController.js';
import { stationList, stationDetail, nearestChargerList } from '../controller/api/ChargingStationController.js';
import { serviceRequest, requestList, requestDetails } from '../controller/api/ChargingInstallationServiceController.js';
import { rsaInvoice, pickAndDropInvoice, portableChargerInvoice, preSaleTestingInvoice, chargerInstallationInvoice } from '../controller/InvoiceController.js';

import { addInsurance, insuranceList, insuranceDetails, evPreSaleBooking, evPreSaleList, evPreSaleDetails, preSaleSlotList } from '../controller/api/EvInsuranceController.js';
import { 
    login, register, forgotPassword, createOTP, verifyOTP, home, getRiderData, updateProfile, deleteImg, logout, updatePassword, locationList, locationAdd, notificationList, 
    addRiderAddress, riderAddressList, deleteRiderAddress, deleteAccount, addRiderVehicle ,editRiderVehicle, riderVehicleList, deleteRiderVehicle, editRiderAddress, defaultAddress, defaultVehicle
} from "../controller/api/RiderController.js";
import {
    addRoadAssistance, roadAssistanceList, roadAssistanceDetail, roadAssistanceInvoiceList, roadAssistanceInvoiceDetail, userFeedbacRSABooking 
} from '../controller/api/RoadAssistanceController.js';
import { 
    addDiscussionBoard, getDiscussionBoardList, getDiscussionBoardDetail, addComment, replyComment, boardLike, boardView, boardShare, votePoll, reportOnBoard, 
    boardNotInterested, boardDelete, editBoard, editPoll, deleteComment, deleteReplyComment, commentLike, replyCommentLike
} from '../controller/api/DiscussionBoardController.js';

import {vehicleList, vehicleDetail, interestedPeople, areaList, sellVehicle, allSellVehicleList, sellVehicleList,
    sellVehicleDetail, updateSellVehicle, deleteSellVehicle, soldSellVehicle, reminder_sell_vehicle_list, vehicleModelList, vehicleBrandList, updateSellVehicleImg, dubaiAreaList
} from '../controller/api/VehicleController.js';
import { 
    chargerList, chargerBooking, chargerBookingList,chargerBookingDetail, invoiceList, getPcSlotList, getPcSubscriptionList, userCancelPCBooking,
    reScheduleBooking, userFeedbackPCBooking
} from '../controller/api/PortableChargerController.js';
import { 
    getChargingServiceSlotList, requestService, listServices, getServiceOrderDetail, getInvoiceList, getInvoiceDetail, cancelValetBooking, userFeedbackValetBooking
} from '../controller/api/ChargingServiceController.js';

import { getPaymentSessionData, getPaymentdetails } from '../controller/TestController.js';

import rateLimit from 'express-rate-limit';
import { responseContent } from "../controller/api/contentController.js";
const router = Router();
 router.get('/response-content',apiAuthorization,responseContent);
const limiter = rateLimit({
    windowMs     : 70 * 1000,  //15 * 
    max          : 2,
    keyGenerator : (req) => req.body.device_id || req.ip, //req.headers['device_id'] || req.ip,
    handler      : (req, res, next, options) => {
        console.log(req.body.device_id || req.ip);
        console.error('Rate limit exceeded:', req.body.device_id || req.ip);
        return res.json({ status : 0, code : options.statusCode, message : [`You have already requested the OTP twice. Please wait for 1 minutes before trying again.`,  ]});
    },
});

/* -- Api Auth Middleware -- */
const authzRoutes = [
    /* API Routes */
    {method: 'post', path: '/rider-login',           handler: login},
    {method: 'post', path: '/registration',          handler: register},
    {method: 'post', path: '/rider-forgot_password', handler: forgotPassword},
    {method: 'post', path: '/create-otp',            handler: createOTP},
    {method: 'post', path: '/verify-otp',            handler: verifyOTP},
    
    /* Dynamic List */
    {method: 'get', path: '/location-list', handler: locationList},
    {method: 'get', path: '/location-add', handler: locationAdd},
    
    /* Vehicle Routes */
    { method: 'get',  path: '/location-area-list',         handler: areaList },
    { method: 'get',  path: '/reminder-sell-vehicle-list', handler: reminder_sell_vehicle_list },
    { method: 'post', path: '/vehicle-brand-list',         handler: vehicleBrandList },
    { method: 'post', path: '/vehicle-model-list',         handler: vehicleModelList },
    { method: 'get',  path: '/dubai-area-list',            handler: dubaiAreaList },

    // { method: 'get',  path: '/auto-cancel-booking',          handler: autoCancelBooking },
];
authzRoutes.forEach(({ method, path, handler }) => {
    const middlewares = [apiAuthorization];  // rateLimit
    if(path === '/registration'){
        const noUpload = multer();
        middlewares.push(noUpload.none()); 
    }
    if(path === '/create-otp'){
        middlewares.push(limiter); 
    }
    router[method](path, ...middlewares, handler);
});

/* -- Api Auth & Api Authz Middleware -- */
const authzAndAuthRoutes = [
    { method: 'get',  path: '/rider-home',                 handler: home },
    { method: 'get',  path: '/get-rider-data',             handler: getRiderData },
    { method: 'post', path: '/rider-profile-change',       handler: updateProfile },
    { method: 'get',  path: '/rider-profile-image-delete', handler: deleteImg },
    { method: 'get',  path: '/rider-account-delete',       handler: deleteAccount },
    { method: 'post', path: '/rider-logout',               handler: logout },
    { method: 'post', path: '/rider-change_password',      handler: updatePassword },
    { method: 'get',  path: '/rider-notification-list',    handler: notificationList },
    { method: 'post', path: '/rider-address-add',          handler: addRiderAddress },
    { method: 'get',  path: '/rider-address-list',         handler: riderAddressList },
    { method: 'post', path: '/rider-address-edit',          handler: editRiderAddress },
    { method: 'get',  path: '/rider-address-delete',       handler: deleteRiderAddress },
    { method: 'post', path: '/rider-vehicle-add',          handler: addRiderVehicle },
    { method: 'post', path: '/rider-vehicle-edit',         handler: editRiderVehicle },
    { method: 'get',  path: '/rider-vehicle-list',         handler: riderVehicleList },
    { method: 'get',  path: '/rider-vehicle-delete',       handler: deleteRiderVehicle },
    { method: 'post', path: '/rider-address-default',      handler: defaultAddress },
    { method: 'post', path: '/rider-vehicle-default',      handler: defaultVehicle },

    /* Public Charging Station */
    { method: 'get', path: '/charging-station-list',         handler: stationList },
    { method: 'get', path: '/nearest-charging-station-list', handler: nearestChargerList },
    { method: 'get', path: '/charging-station-detail',       handler: stationDetail },

    /* Car Rental */
    { method: 'get', path: '/car-rental-list',   handler: carList },
    { method: 'get', path: '/car-rental-detail', handler: carDetail },

    /* Bike Rental Routes */
    { method: 'get', path: '/bike-rental-list',   handler: bikeList },
    { method: 'get', path: '/bike-rental-detail', handler: bikeDetail },

    /* Road Assistance Routes */
    { method: 'post', path: '/road-assistance',                handler: addRoadAssistance },
    { method: 'get',  path: '/road-assistance-list',           handler: roadAssistanceList },
    { method: 'get',  path: '/road-assistance-details',        handler: roadAssistanceDetail },
    { method: 'get',  path: '/road-assistance-invoice-list',   handler: roadAssistanceInvoiceList },
    { method: 'get',  path: '/road-assistance-invoice-detail', handler: roadAssistanceInvoiceDetail },
    { method: 'post', path: '/feedback-road-assistance',       handler: userFeedbacRSABooking },

    /* Installation Service Routes */
    { method: 'post', path: '/charging-installation-service',  handler: serviceRequest },
    { method: 'get',  path: '/charging-installation-list',     handler: requestList },
    { method: 'get',  path: '/charging-installation-detail',   handler: requestDetails },

    /* Club Routes */
    { method: 'get', path: '/club-list',   handler: clubList },
    { method: 'get', path: '/club-detail', handler: clubDetail },

    /* Vehicle Routes */
    { method: 'get',  path: '/vehicle-list',          handler: vehicleList },
    { method: 'get',  path: '/vehicle-detail',        handler: vehicleDetail },
    { method: 'post', path: '/interest-register',     handler: interestedPeople },
    { method: 'post', path: '/sell-vehicle',          handler: sellVehicle },
    { method: 'get',  path: '/all-sell-vehicle-list', handler: allSellVehicleList },
    { method: 'get',  path: '/sell-vehicle-list',     handler: sellVehicleList },
    { method: 'get',  path: '/sell-vehicle-details',  handler: sellVehicleDetail },
    { method: 'post', path: '/edit-sell-vehicle',     handler: updateSellVehicle },
    { method: 'post', path: '/edit-sell-vehicle-img', handler: updateSellVehicleImg },
    { method: 'get',  path: '/delete-sell-vehicle',   handler: deleteSellVehicle },
    { method: 'get',  path: '/sold-sell-vehicle',     handler: soldSellVehicle },

    /* Discussion Board */
    { method: 'post', path: '/add-discussion-board',             handler: addDiscussionBoard },
    { method: 'get',  path: '/discussion-board-list',            handler: getDiscussionBoardList },
    { method: 'get',  path: '/discussion-board-detail',          handler: getDiscussionBoardDetail },
    { method: 'post', path: '/add-comment',                      handler: addComment },
    { method: 'post', path: '/reply-comment',                    handler: replyComment },
    { method: 'get',  path: '/board-like',                       handler: boardLike },
    { method: 'get',  path: '/board-view',                       handler: boardView },
    { method: 'get',  path: '/board-share',                      handler: boardShare },
    { method: 'get',  path: '/board-vote-poll',                  handler: votePoll },
    { method: 'get',  path: '/discussion-board-report',          handler: reportOnBoard },
    { method: 'get',  path: '/discussion-board-not-interested',  handler: boardNotInterested },
    { method: 'get',  path: '/discussion-board-delete',          handler: boardDelete },
    { method: 'post', path: '/discussion-board-edit',            handler: editBoard },
    { method: 'post', path: '/board-vote-edit',                  handler: editPoll },
    { method: 'post', path: '/delete-comment',                   handler: deleteComment },
    { method: 'post', path: '/delete-reply-comment',             handler: deleteReplyComment },
    { method: 'get',  path: '/comment-like',                     handler: commentLike },
    { method: 'get',  path: '/reply-comment-like',               handler: replyCommentLike },

    /* Charging Service */
    { method: 'post', path: '/charging-service-slot-list',   handler: getChargingServiceSlotList },
    { method: 'post', path: '/charging-service',             handler: requestService },
    { method: 'get',  path: '/charging-service-list',        handler: listServices },
    { method: 'get',  path: '/charging-service-details',     handler: getServiceOrderDetail },
    { method: 'get',  path: '/pick-and-drop-invoice-list',   handler: getInvoiceList },
    { method: 'get',  path: '/pick-and-drop-invoice-detail', handler: getInvoiceDetail },
    { method: 'post', path: '/charging-service-cancel',      handler: cancelValetBooking },
    { method: 'post', path: '/feedback-charging-service',    handler: userFeedbackValetBooking },

    /* Portable charger */
    { method: 'get',  path: '/portable-charger-list',            handler: chargerList },
    { method: 'post', path: '/portable-charger-booking',         handler: chargerBooking },
    { method: 'get',  path: '/portable-charger-booking-list',    handler: chargerBookingList },
    { method: 'get',  path: '/portable-charger-booking-detail',  handler: chargerBookingDetail },
    { method: 'get',  path: '/portable-charger-slot-list',       handler: getPcSlotList },
    { method: 'get',  path: '/portable-charger-subscription',    handler: getPcSubscriptionList },
    { method: 'get',  path: '/portable-charger-cancel',          handler: userCancelPCBooking }, 
    { method: 'post', path: '/reschedule-portable-charger-booking', handler: reScheduleBooking },
    { method: 'post', path: '/feedback-portable-charger-booking', handler: userFeedbackPCBooking },

    /* Offer Routes */
    { method: 'get', path: '/offer-list',   handler: offerList },
    { method: 'get', path: '/offer-detail', handler: offerDetail },
    { method: 'post', path: '/create-offer-history', handler: offerHistory },

    /* Service Shop */
    { method: 'get', path: '/service-shop-list',    handler: shopList },
    { method: 'get', path: '/service-shop-detail',  handler: shopDetail },

    /* EV Insurance */
    { method: 'post', path: '/add-insurance',          handler: addInsurance},
    { method: 'post', path: '/insurance-list',         handler: insuranceList },
    { method: 'post', path: '/insurance-details',      handler: insuranceDetails },
    { method: 'post', path: '/ev-pre-sale-testing',    handler: evPreSaleBooking },
    { method: 'get',  path: '/ev-pre-sale-list',       handler: evPreSaleList },
    { method: 'get',  path: '/ev-pre-sale-detail',     handler: evPreSaleDetails },
    { method: 'post', path: '/ev-pre-sale-slot-list',  handler: preSaleSlotList },

    /* Payment */
    { method: 'post', path: '/payment-intent',                       handler: createIntent },
    { method: 'post', path: '/add-card',                             handler: addCardToCustomer },
    { method: 'post', path: '/remove-card',                          handler: removeCard },
    { method: 'post', path: '/list-card',                            handler: customerCardsList },
    { method: 'post', path: '/create-portable-charger-subscription', handler: createPortableChargerSubscription },
    { method: 'post', path: '/get-payment-session',                  handler: getPaymentSession },
    { method: 'post', path: '/saved-card-payment',                  handler: savedcardPayment },

    /* Invoice */ 
    { method: 'post', path: '/create-rsa-invoice',                  handler: rsaInvoice },
    { method: 'post', path: '/create-pick-drop-invoice',            handler: pickAndDropInvoice },
    { method: 'post', path: '/create-portable-charger-invoice',     handler: portableChargerInvoice },
    // { method: 'post', path: '/create-pre-sale-invoice',             handler: preSaleTestingInvoice },
    // { method: 'get',  path: '/create-charger-installation-invoice', handler: chargerInstallationInvoice },
];
authzAndAuthRoutes.forEach(({ method, path, handler }) => {
    const middlewares = []; 
   
    if(path === '/rider-profile-change'){
        middlewares.push(handleFileUpload('rider_profile', ['profile_image'], 1));

    } else if(path === '/sell-vehicle' || path === '/edit-sell-vehicle' || path === '/edit-sell-vehicle-img'){
        middlewares.push(handleFileUpload('vehicle-image', ['car_images', 'car_tyre_image', 'other_images', 'image'], 5));
    } else if(path === '/add-discussion-board' || path === '/discussion-board-edit'){
        middlewares.push(handleFileUpload('discussion-board-images', ['image'], 5));

    } else if(path === '/ev-pre-sale-testing' || path === '/board-vote-edit'){
        const noUpload1 = multer(); middlewares.push(noUpload1.none()); 
        
    } else if(path === '/add-insurance'){
        middlewares.push(handleFileUpload('insurance-images', ['vehicle_registration_img', 'driving_licence', 'car_images', 'car_type_image', 'scretch_image', 'emirates_id'], 5));
    }
    middlewares.push(apiAuthorization);
    middlewares.push(apiAuthentication);
    router[method](path, ...middlewares, handler);
});

router.post('/validate-coupon', redeemCoupon);
router.post('/auto-pay', autoPay);
// router.post('/add-card', addCardToCustomer);
// router.post('/remove-card', removeCard);
// router.post('/list-card', customerCardsList);

router.get('/get-payment-session-data', getPaymentSessionData); 
router.get('/get-payment-data', getPaymentdetails); 

// router.post('/failed-pod-booking', failedPODBooking); 
// router.post('/failed-valet-booking', failedValetBooking); 
// router.post('/failed-rsa-booking', failedRSABooking); 

export default router;