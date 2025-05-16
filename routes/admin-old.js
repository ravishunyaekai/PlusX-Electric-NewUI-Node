import { Router } from "express";
import { authenticate, authenticateAdmin } from "../middleware/admin/authenticationMiddleware.js";
import { adminAuthorization } from "../middleware/admin/authorizeMiddleware.js";
import { login, logout, forgotPassword, updatePassword } from "../controller/admin/AuthController.js";
import { getDashboardData, riderList, riderDetails,deleteRider } from "../controller/admin/AdminController.js";
import { chargerList, addCharger, editCharger, deleteCharger, chargerBookingList, chargerBookingDetails, assignBooking, chargerDetails, 
    invoiceList,invoiceDetails, slotList, addSlot, editSlot, deleteSlot, slotDetails, subscriptionList, subscriptionDetail, adminCancelPCBooking
} from "../controller/admin/PortableChargerController.js";
import { handleFileUpload } from "../fileUpload.js";
import { 
    bookingDetails, bookingList, pdAddSlot, pdDeleteSlot, pdEditSlot, pdInvoiceDetails, pdInvoiceList, pdSlotList, PodAssignBooking as pdAssignBooking, pdSlotDetails, 
    adminCancelCSBooking 
} from "../controller/admin/PickAndDropController.js";
import { addPublicCharger, editPublicCharger, stationDetail, stationList, deletePublicCharger, deletePublicChargerGallery, stationData } from "../controller/admin/PublicChargerController.js";
import { chargerInstallationDetails, chargerInstallationList } from "../controller/admin/ChargerInstallationController.js";
import { 
    storeList, storeData, storeAdd, storeView, storeUpdate, storeDelete,serviceList, serviceCreate, serviceUpdate, serviceDelete, brandList, brandCreate, brandUpdate, brandDelete
} from "../controller/admin/ShopController.js";
import { rsaList, rsaData, rsaAdd, rsaUpdate, rsaDelete, rsaStatusChange,  } from "../controller/admin/RsaController.js";
import { clubList, clubData, clubCreate, clubUpdate, clubDelete, clubDeleteImg } from "../controller/admin/RiderClubController.js"
import { carsList, carDetail, carAdd, carEdit, carDelete, carGalleryDelete } from "../controller/admin/ElectriCarLeasingController.js";
import { bikeDetail, bikesList, bikeAdd, bikeEdit, bikeDelete, bikeGalleryDelete } from "../controller/admin/ElectricBikeRentalController.js";
import {
    bookingData, bookingList as evRoadAssistanceBooking, invoiceList as evRoadAssistanceInvoice, invoiceData, evRoadAssistanceConfirmBooking, evRoadAssistanceCancelBooking
} from '../controller/admin/EvRoadAssistanceController.js'
import { interestList } from "../controller/admin/RegisterInterestController.js";
import { couponData, couponDetail, couponList, couponAdd, couponEdit, couponDelete } from "../controller/admin/CouponController.js";
import { offerDetail, offerList, offerAdd, offerEdit, offerDelete } from "../controller/admin/OfferController.js";
import {guideList, addGuide, guideDetail, editGuide, deleteGuide, deleteEvGuideGallery} from "../controller/admin/EvGuideController.js";
import { 
    evInsuranceList, evInsuranceDetail, evPreSaleList, evPreSaleDetail, evPreSaleTimeSlot, evPreSaleTimeSlotAdd, evPreSaleTimeSlotEdit, evPreSaleTimeSlotDelete, 
    evPreSaleTimeSlotDetails
} from "../controller/admin/EvInsuranceController.js";
import { sellVehicleDetail, sellVehicleList } from "../controller/admin/VehicleController.js";
import { discussionBoardList, discussionBoardDetail, discussionBoardDelete } from "../controller/admin/DiscussionBoardController.js";


import { podDeviceList, podDeviceDetails, addPodDevice, editPodDevice, deletePodDevice, AllpodDevice, addPodBrand, podBrandList, deviceBrandList, podAreaList, addPodArea, podAreaDetails, editPodArea } from "../controller/admin/PodDeviceController.js";

const router = Router();
const adminAuthRoutes = [
    { method: 'post', path: '/login', handler: login },
]
adminAuthRoutes.forEach(({ method, path, handler }) => {
    router[method](path, adminAuthorization, handler);
});

const adminRoutes = [
    { method: 'put',  path: '/logout',          handler: logout },
    { method: 'post', path: '/forgot-password', handler: forgotPassword },
    { method: 'put',  path: '/change-password', handler: updatePassword },
    { method: 'post', path: '/dashboard',       handler: getDashboardData },
    { method: 'post', path: '/rider-list',      handler: riderList },
    { method: 'post', path: '/rider-details',   handler: riderDetails },
    { method: 'post', path: '/delete-rider',    handler: deleteRider },

    /* Portable Charger */ 
    { method: 'post',   path: '/charger-list',                    handler: chargerList },
    { method: 'post',   path: '/charger-details',                 handler: chargerDetails },
    { method: 'post',   path: '/add-charger',                     handler: addCharger },
    { method: 'post',   path: '/edit-charger',                    handler: editCharger },
    { method: 'post',   path: '/delete-charger',                  handler: deleteCharger },
    { method: 'post',   path: '/charger-booking-list',            handler: chargerBookingList },
    { method: 'post',   path: '/charger-booking-details',         handler: chargerBookingDetails },
    { method: 'post',   path: '/charger-booking-invoice-list',    handler: invoiceList },
    { method: 'post',   path: '/charger-booking-invoice-details', handler: invoiceDetails },
    { method: 'post',   path: '/charger-booking-assign',          handler: assignBooking },
    { method: 'post',   path: '/charger-slot-list',               handler: slotList },
    { method: 'post',   path: '/charger-slot-details',            handler: slotDetails },
    { method: 'post',   path: '/charger-add-time-slot',           handler: addSlot },
    { method: 'post',   path: '/charger-edit-time-slot',          handler: editSlot },
    { method: 'post',   path: '/charger-delete-time-slot',        handler: deleteSlot },

    /* Pick & Drop */
    { method: 'post',   path: '/pick-and-drop-booking-list',     handler: bookingList },
    { method: 'post',   path: '/pick-and-drop-booking-details',  handler: bookingDetails },
    { method: 'post',   path: '/pick-and-drop-assign',           handler: pdAssignBooking },
    { method: 'post',   path: '/pick-and-drop-invoice-list',     handler: pdInvoiceList },
    { method: 'post',   path: '/pick-and-drop-invoice-details',  handler: pdInvoiceDetails },
    { method: 'post',   path: '/pick-and-drop-slot-list',        handler: pdSlotList },
    { method: 'post',   path: '/pick-and-drop-slot-details',     handler: pdSlotDetails },
    { method: 'post',   path: '/pick-and-drop-add-slot',         handler: pdAddSlot },
    { method: 'post',   path: '/pick-and-drop-edit-slot',        handler: pdEditSlot },
    { method: 'post',   path: '/pick-and-drop-delete-slot',      handler: pdDeleteSlot },

    /* Public Charger */
    { method: 'post',   path: '/public-charger-station-list',    handler: stationList },
    { method: 'post',   path: '/public-charger-station-details', handler: stationDetail },
    { method: 'post',   path: '/public-charger-station-data',    handler: stationData },
    { method: 'post',   path: '/public-charger-add-station',     handler: addPublicCharger },
    { method: 'post',   path: '/public-charger-edit-station',    handler: editPublicCharger },
    { method: 'delete', path: '/public-chargers-delete',         handler: deletePublicCharger },
    { method: 'delete', path: '/chargers-gallery-del',           handler: deletePublicChargerGallery },

    /* Charger Installation */
    { method: 'post', path: '/charger-installation-list',    handler: chargerInstallationList },
    { method: 'post', path: '/charger-installation-details', handler: chargerInstallationDetails },
    
    /* Service Shops */
    { method: 'post',   path: '/shop-list',           handler: storeList },
    { method: 'post',   path: '/shop-data',           handler: storeData },
    { method: 'post',   path: '/shop-add',            handler: storeAdd },
    { method: 'post',   path: '/shop-view',           handler: storeView },
    { method: 'post',   path: '/shop-update',         handler: storeUpdate },
    { method: 'post',   path: '/shop-delete',         handler: storeDelete },
    { method: 'post',   path: '/shop-service-list',   handler: serviceList },
    { method: 'post',   path: '/shop-service-create', handler: serviceCreate },
    { method: 'post',   path: '/shop-service-update', handler: serviceUpdate },
    { method: 'post',   path: '/shop-service-delete', handler: serviceDelete },
    { method: 'post',   path: '/shop-brand-list',     handler: brandList },
    { method: 'post',   path: '/shop-brand-create',   handler: brandCreate },
    { method: 'post',   path: '/shop-brand-update',   handler: brandUpdate },
    { method: 'post',   path: '/shop-brand-delete',   handler: brandDelete },

    /* RSA Routes */
    { method: 'post',  path: '/rsa-list',          handler: rsaList },
    { method: 'post',  path: '/rsa-data',          handler: rsaData },
    { method: 'post',  path: '/rsa-add',           handler: rsaAdd },
    { method: 'post',  path: '/rsa-update',        handler: rsaUpdate },
    { method: 'post',  path: '/rsa-delete',        handler: rsaDelete },
    { method: 'post',  path: '/rsa-status-change', handler: rsaStatusChange },

    /* Rider Clubs */
    { method: 'post',   path: '/club-list',       handler: clubList },
    { method: 'post',   path: '/club-data',       handler: clubData },
    { method: 'post',   path: '/add-club',        handler: clubCreate },
    { method: 'post',   path: '/edit-club',       handler: clubUpdate },
    { method: 'post',   path: '/club-delete',     handler: clubDelete },
    { method: 'delete', path: '/club-delete-img', handler: clubDeleteImg },

    /* Electric Cars Leasing */
    { method: 'post',    path: '/electric-cars-list',     handler: carsList },
    { method: 'post',    path: '/electric-car-detail',    handler: carDetail },
    { method: 'post',    path: '/electric-car-add',       handler: carAdd },
    { method: 'post',    path: '/electric-car-edit',      handler: carEdit },
    { method: 'post',    path: '/electric-car-delete',    handler: carDelete },
    { method: 'delete',  path: '/electric-car-gallery-d', handler: carGalleryDelete },

    /* Electric Bikes Leasing */
    { method: 'post',    path: '/electric-bikes-list',     handler: bikesList },
    { method: 'post',    path: '/electric-bike-detail',    handler: bikeDetail },
    { method: 'post',    path: '/electric-bike-add',       handler: bikeAdd },
    { method: 'post',    path: '/electric-bike-edit',      handler: bikeEdit },
    { method: 'post',    path: '/electric-bike-delete',    handler: bikeDelete },
    { method: 'delete',  path: '/electric-bike-gallery-d', handler: bikeGalleryDelete },

    /* EV Road Assistance */
    { method: 'post', path: '/ev-road-assistance-booking-list',    handler: evRoadAssistanceBooking },
    { method: 'post', path: '/ev-road-assistance-booking-details', handler: bookingData },
    { method: 'post', path: '/ev-road-assistance-confirm-booking', handler: evRoadAssistanceConfirmBooking },
    { method: 'post', path: '/ev-road-assistance-cancel-booking',  handler: evRoadAssistanceCancelBooking },
    { method: 'post', path: '/ev-road-assistance-invoice-list',    handler: evRoadAssistanceInvoice },
    { method: 'post', path: '/ev-road-assistance-invoice-data',    handler: invoiceData },

    /* Interest List */ 
    { method: 'post',  path: '/interest-list', handler: interestList },

    /* Coupon */
    { method: 'post',   path: '/coupon-list',     handler: couponList },
    { method: 'post',   path: '/coupon-detail',   handler: couponDetail },
    { method: 'post',   path: '/coupon-data',     handler: couponDetail },
    { method: 'post',   path: '/add-coupan',      handler: couponAdd },
    { method: 'post',   path: '/edit-coupan',     handler: couponEdit },
    { method: 'post',   path: '/delete-coupan',   handler: couponDelete },

    /* Offer */
    { method: 'post',   path: '/offer-list',   handler: offerList },
    { method: 'post',   path: '/offer-detail', handler: offerDetail },
    { method: 'post',   path: '/add-offer',    handler: offerAdd },
    { method: 'post',   path: '/edit-offer',   handler: offerEdit },
    { method: 'post',   path: '/delete-offer', handler: offerDelete },

    /* Subscription */
    { method: 'post',  path: '/subscription-list',    handler: subscriptionList },
    { method: 'post',  path: '/subscription-detail', handler: subscriptionDetail },
    
    /* Discussion Board */
    { method: 'post',   path: '/discussion-board-list',   handler: discussionBoardList },
    { method: 'post',   path: '/discussion-board-detail', handler: discussionBoardDetail },
    { method: 'post',   path: '/discussion-board-delete', handler: discussionBoardDelete },

    /* Ev Guide Routes */
    { method: 'post',  path: '/ev-guide-list',            handler: guideList },
    { method: 'post',  path: '/ev-guide-add',             handler: addGuide },
    { method: 'post',  path: '/ev-guide-details',         handler: guideDetail },
    { method: 'post',  path: '/ev-guide-update',          handler: editGuide },
    { method: 'post',  path: '/ev-guide-delete',          handler: deleteGuide },
    { method: 'post',  path: '/ev-guide-gallery-delete',  handler: deleteEvGuideGallery },

    /* EV Buy & Sell */
    { method: 'post',  path: '/buy-sell-list',    handler: sellVehicleList },
    { method: 'post',  path: '/buy-sell-detail', handler: sellVehicleDetail },

    /* EV Insurance */
    { method: 'post',  path: '/ev-insurance-list',                 handler: evInsuranceList },
    { method: 'post',  path: '/ev-insurance-detail',               handler: evInsuranceDetail },

    /* EV Pre-Sale */
    { method: 'post',  path: '/ev-pre-sale-list',                  handler: evPreSaleList },
    { method: 'post',  path: '/ev-pre-sale-detail',                handler: evPreSaleDetail },
    { method: 'post',  path: '/ev-pre-sale-time-slot-list',        handler: evPreSaleTimeSlot },
    { method: 'post',  path: '/ev-pre-sale-time-slot-details',     handler: evPreSaleTimeSlotDetails },
    { method: 'post',  path: '/ev-pre-sale-add-time-slot-list',    handler: evPreSaleTimeSlotAdd },
    { method: 'post',  path: '/ev-pre-sale-edit-time-slot-list',   handler: evPreSaleTimeSlotEdit },
    { method: 'post',  path: '/ev-pre-sale-delete-time-slot-list', handler: evPreSaleTimeSlotDelete },

    /* Admin Booking Cancel */
    { method: 'post', path: '/portable-charger-cancel',  handler: adminCancelPCBooking },
    { method: 'post', path: '/charging-service-cancel',  handler: adminCancelCSBooking },
    
    /* POD Device Routes */
    { method: 'post',  path: '/pod-device-list',            handler: podDeviceList },
    { method: 'post',  path: '/pod-device-add',             handler: addPodDevice },
    { method: 'post',  path: '/pod-device-details',         handler: podDeviceDetails },
    { method: 'post',  path: '/pod-device-update',          handler: editPodDevice },
    { method: 'post',  path: '/pod-device-delete',          handler: deletePodDevice },

    /* POD Device Brand Routes */
    { method: 'post',  path: '/all-pod-device',             handler: AllpodDevice},
    { method: 'post',  path: '/pod-brand-list',             handler: podBrandList },
    { method: 'post',  path: '/add-pod-brand',              handler: addPodBrand },
    { method: 'post',  path: '/pod-brand-details',          handler: podDeviceDetails },
    { method: 'post',  path: '/edit-pod-brand',             handler: editPodDevice },
    { method: 'post',  path: '/pod-brand-delete',           handler: deletePodDevice },
    { method: 'post',  path: '/device-brand-list',          handler: deviceBrandList },

    /* POD Area Routes */
    { method: 'post',  path: '/pod-area-list',            handler: podAreaList },
    { method: 'post',  path: '/pod-area-add',             handler: addPodArea },
    { method: 'post',  path: '/pod-area-details',         handler: podAreaDetails },
    { method: 'post',  path: '/pod-area-update',          handler: editPodArea },
    
]; 

adminRoutes.forEach(({ method, path, handler }) => {
    const middlewares = [adminAuthorization];

    if (path === '/add-charger' || path === '/edit-charger') {
        middlewares.push(handleFileUpload('charger-images', ['charger_image'], 1));
    }
    if (path === '/rsa-add' || path === '/rsa-update') {
        middlewares.push(handleFileUpload('rsa_images', ['profile_image'], 1));
    }
    if (path === '/shop-add' || path === '/shop-update') {
        middlewares.push(handleFileUpload('shop-images', ['cover_image', 'shop_gallery'], 5));
    }
    if (path === '/public-charger-add-station' || path === '/public-charger-edit-station') {
        middlewares.push(handleFileUpload('charging-station-images', ['cover_image', 'shop_gallery'], 5));
    }
    if (path === '/add-club' || path === '/edit-club') {
        middlewares.push(handleFileUpload('club-images', ['cover_image', 'club_gallery'], 5));
    }
    if (path === '/ev-guide-add' || path === '/ev-guide-update') {
        middlewares.push(handleFileUpload('vehicle-image', ['cover_image', 'vehicle_gallery'], 5));
    }
    if (path === '/add-offer' || path === '/edit-offer') {
        middlewares.push(handleFileUpload('offer', ['offer_image'], 1));
    }
    if (path === '/electric-bike-add' || path === '/electric-bike-edit') {
        middlewares.push(handleFileUpload('bike-rental-images', ['cover_image', 'rental_gallery'], 5));
    }
    if (path === '/electric-car-add' || path === '/electric-car-edit') {
        middlewares.push(handleFileUpload('car-rental-images', ['cover_image', 'rental_gallery'], 5));
    }
    if (path === '/add-pod-brand' || path === '/edit-pod-brand') {
        middlewares.push(handleFileUpload('pod-brand-images', ['brand_image'], 1));
    }
    middlewares.push(authenticateAdmin);
    // middlewares.push(authenticate);

    router[method](path, ...middlewares, handler);
});

export default router;