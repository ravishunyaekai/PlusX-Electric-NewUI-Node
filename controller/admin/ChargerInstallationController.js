import db from '../../config/db.js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { mergeParam, getOpenAndCloseTimings, convertTo24HourFormat, formatDateTimeInQuery} from '../../utils.js';
import { queryDB, getPaginatedData, insertRecord, updateRecord } from '../../dbUtils.js';
import validateFields from "../../validation.js";
dotenv.config();


export const chargerInstallationList = async (req, resp) => {
    try {
        const { page_no, sort_by = 'd' ,search_text=''} = req.body;
        const { isValid, errors } = validateFields(req.body, { page_no: ["required"] });
        if (!isValid) {
            return resp.json({ status: 0, code: 422, message: errors });
        }

    const sortOrder = sort_by === 'd' ? 'DESC' : 'ASC';

    const result = await getPaginatedData({
        tableName: 'charging_installation_service',
        columns: `request_id, name, email, country_code, contact_no, looking_for, resident_type, address, latitude, longitude, order_status, ${formatDateTimeInQuery(['created_at'])}`,
        sortColumn : 'id',
        sortOrder,
        page_no,
        liveSearchFields : ['request_id', 'name', 'contact_no', ],
        liveSearchTexts  : [search_text, search_text, search_text],
        limit: 10,
    });

    return resp.json({
        status     : 1,
        code       : 200,
        message    : ["Charging Installation Service List fetch successfully!"],
        data       : result.data,
        total_page : result.totalPage,
        total      : result.total,
    });

    } catch (error) {
        console.error('Error fetching station list:', error);
        return resp.status(500).json({
            status: 0,
            code: 500,
            message: 'Error fetching station list'
        });
    }
};

export const chargerInstallationDetails = async (req, resp) => {     
    const { request_id } = req.body;
    const { isValid, errors } = validateFields(req.body, { request_id : ["required"] });
    if (!isValid) {
        return resp.json({ status: 0, code: 422, message: errors });
    }
    const [orderData] = await db.execute(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM charging_installation_service WHERE request_id = ? LIMIT 1`, [request_id]);

    orderData[0].invoice_url = '';
    if (orderData[0].order_status == 'ES') {
        const invoice_id = orderData[0].request_id.replace('CS', 'INVCS');
        orderData[0].invoice_url = `${req.protocol}://${req.get('host')}/public/charger-installation-invoice/${invoice_id}-invoice.pdf`;
    }

    const [history] = await db.execute(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM charging_installation_service_history WHERE service_id = ?`, [request_id]);

    return resp.json({
        message       : ["Charging Installation Service fetched successfully!"],
        service_data  : orderData[0],
        order_history : history,
        status        : 1,
        code          : 200,
    });
};
