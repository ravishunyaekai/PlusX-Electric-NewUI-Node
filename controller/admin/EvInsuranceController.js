import db from "../../config/db.js";
import generateUniqueId from 'generate-unique-id';
import { getPaginatedData, insertRecord, queryDB, updateRecord } from '../../dbUtils.js';
import { asyncHandler, convertTo24HourFormat, formatDateInQuery, formatDateTimeInQuery } from '../../utils.js';
import validateFields from "../../validation.js";
import moment from 'moment';

// EV Insurance
export const evInsuranceList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;
    const result = await getPaginatedData({
        tableName: 'ev_insurance',
        columns: `insurance_id, owner_name, country, country_code, mobile_no, car_brand, car_images, registration_place, vehicle`,
        liveSearchFields: ['insurance_id', 'owner_name'],
        liveSearchTexts: [search_text, search_text],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["EV Insurance List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });   
});

export const evInsuranceDetail = asyncHandler(async (req, resp) => {
    const { insurance_id } = req.body;
    const { isValid, errors } = validateFields(req.body, {insurance_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const data = await queryDB(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at', 'insurance_expiry'])}, ${formatDateInQuery(['date_of_birth'])} FROM ev_insurance WHERE insurance_id = ? LIMIT 1`, [insurance_id]);
    
    return resp.json({
        status   : 1,
        code     : 200,
        message  : ["EV Insurance Detail fetched successfully!"],
        data     : data,
        base_url : `https://plusx.s3.ap-south-1.amazonaws.com/uploads/insurance-images/`,
    });
});

// EV Pre-Sale Testing Booking
export const evPreSaleList = asyncHandler(async (req, resp) => {
    const { search_text, page_no, start_date, end_date, } = req.body;
    const whereFields    = []
    const whereValues    = []
    const whereOperators = []

    if (start_date && end_date) {
        // const start = moment(start_date, "YYYY-MM-DD").startOf('day').format("YYYY-MM-DD HH:mm:ss");
        // const end = moment(end_date, "YYYY-MM-DD").endOf('day').format("YYYY-MM-DD HH:mm:ss");
        const startToday         = new Date(start_date);
        const startFormattedDate = `${startToday.getFullYear()}-${(startToday.getMonth() + 1).toString()
            .padStart(2, '0')}-${startToday.getDate().toString().padStart(2, '0')}`;
                    
        const givenStartDateTime    = startFormattedDate+' 00:00:01'; // Replace with your datetime string
        const modifiedStartDateTime = moment(givenStartDateTime).subtract(4, 'hours'); // Subtract 4 hours
        const start                 = modifiedStartDateTime.format('YYYY-MM-DD HH:mm:ss')
        
        const endToday         = new Date(end_date);
        const formattedEndDate = `${endToday.getFullYear()}-${(endToday.getMonth() + 1).toString()
            .padStart(2, '0')}-${endToday.getDate().toString().padStart(2, '0')}`;
        const end = formattedEndDate+' 19:59:59';

        whereFields.push('created_at', 'created_at');
        whereValues.push(start, end);
        whereOperators.push('>=', '<=');
    }


    const result = await getPaginatedData({
        tableName: 'ev_pre_sale_testing',
        columns: `booking_id, owner_name, country_code, mobile_no, ${formatDateTimeInQuery(['created_at'])},
            (SELECT CONCAT(vehicle_model, "-", vehicle_make) FROM riders_vehicles AS rv WHERE rv.vehicle_id = ev_pre_sale_testing.vehicle) AS vehicle_data
        `,
        liveSearchFields: ['booking_id', 'owner_name'],
        liveSearchTexts: [search_text, search_text],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
        whereField: whereFields,
        whereValue: whereValues,
        whereOperator: whereOperators
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Ev pre sale booking list fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });
});

export const evPreSaleDetail = asyncHandler(async (req, resp) => {
    const { booking_id } = req.body;
    const { isValid, errors } = validateFields(req.body, {booking_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const data = await queryDB(`
        SELECT 
            ev_pre_sale_testing.*, 
            (SELECT CONCAT(rv.vehicle_model, "-", rv.vehicle_make) FROM riders_vehicles AS rv WHERE rv.vehicle_id = ev_pre_sale_testing.vehicle) AS vehicle_data,
            ${formatDateTimeInQuery(['created_at', 'updated_at'])},
            ${formatDateInQuery(['date_of_birth', 'slot_date'])} 
        FROM ev_pre_sale_testing 
        WHERE booking_id = ? 
        LIMIT 1
    `, [booking_id]);
    
    return resp.json({
        status   : 1,
        code     : 200,
        message  : ["EV Insurance Detail fetched successfully!"],
        data     : data,
        base_url : `https://plusx.s3.ap-south-1.amazonaws.com/uploads/insurance-images/`,
    });
});

// Time Slot 
export const evPreSaleTimeSlot = asyncHandler(async (req, resp) => {
    const { page_no, search_text= '', start_date, end_date, } = req.body;

    let slot_date = moment().format("YYYY-MM-DD"); // {formatDateInQuery(['slot_date'])},

    const params = {
        tableName : 'ev_pre_sale_testing_slot',
        columns   : `slot_id, start_time, end_time, booking_limit, status, ${formatDateTimeInQuery(['created_at'])}, slot_date,
            (SELECT COUNT(id) FROM ev_pre_sale_testing AS evpst WHERE evpst.slot_time_id=ev_pre_sale_testing_slot.slot_id AND evpst.slot_date='${slot_date}') AS slot_booking_count
        `,
        sortColumn       : 'slot_date DESC, start_time ASC',
        sortOrder        : '',
        page_no,
        limit            : 10,
        liveSearchFields : ['slot_id',],
        liveSearchTexts  : [search_text,],
        whereField       : [],
        whereValue       : [],
        whereOperator    : []
    };

    if (start_date && end_date) {
        const start = moment(start_date, "YYYY-MM-DD").format("YYYY-MM-DD");
        const end = moment(end_date, "YYYY-MM-DD").format("YYYY-MM-DD");
        params.whereField.push('slot_date', 'slot_date');
        params.whereValue.push(start, end);
        params.whereOperator.push('>=', '<=');
    }

    const result = await getPaginatedData(params);

    const formattedData = result.data.map((item) => ({
        slot_id            : item.slot_id,
        slot_date          : moment(item.slot_date, "DD-MM-YYYY").format('YYYY-MM-DD'),
        booking_limit      : item.booking_limit,
        status             : item.status,
        slot_booking_count : item.slot_booking_count,
        timing             : `${item.start_time} - ${item.end_time}`
    }));

    return resp.json({
        status: 1,
        code: 200,
        message: ["EV Time Slot List fetch successfully!"],
        data: formattedData,
        total_page: result.totalPage,
        total: result.total,
    }); 
});

export const evPreSaleTimeSlotDetails = async (req, resp) => {
    try {
        const { slot_date, } = req.body;
        const { isValid, errors } = validateFields(req.body, { slot_date: ["required"] });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
        let slotDate = moment().format("YYYY-MM-DD");

        const [slotDetails] = await db.execute(`
            SELECT 
                id, slot_id, start_time, end_time, booking_limit, status, ${formatDateInQuery(['slot_date'])},
                (SELECT COUNT(id) FROM ev_pre_sale_testing AS evpst WHERE evpst.slot_time_id=ev_pre_sale_testing_slot.slot_id AND evpst.slot_date='${slotDate}') AS slot_booking_count
            FROM 
                ev_pre_sale_testing_slot 
            WHERE 
                slot_date = ?`, 
            [slot_date]
        );

        return resp.json({ status: 1, code: 200, message: ["EV Time Slot Details fetch successfully!"], data: slotDetails });
    } catch (error) {
        console.error('Error fetching slot list:', error);
        return resp.status(500).json({ status: 0, message: 'Error fetching charger lists' });
    }
};

export const evPreSaleTimeSlotAdd = asyncHandler(async (req, resp) => {
    const { slot_date, start_time, end_time, booking_limit, status = 1 }  = req.body;
    const { isValid, errors } = validateFields(req.body, { slot_date: ["required"], start_time: ["required"], end_time: ["required"], booking_limit: ["required"]  });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    if ( !Array.isArray(start_time) || !Array.isArray(end_time) || !Array.isArray(booking_limit) || !Array.isArray(status)) {
        return resp.json({ status: 0, code: 422, message: 'Input data must be in array format.' });
    }
    if ( start_time.length !== end_time.length || end_time.length !== booking_limit.length || booking_limit.length !== status.length) {
        return resp.json({ status: 0, code: 422, message: 'All input arrays must have the same length.' });
    }

    const values = []; const placeholders = [];
    const fSlotDate = moment(slot_date, "DD-MM-YYYY").format("YYYY-MM-DD");
    for (let i = 0; i < start_time.length; i++) {
        const slotId = `PST${generateUniqueId({ length:6 })}`;
        values.push(slotId, fSlotDate, convertTo24HourFormat(start_time[i]), convertTo24HourFormat(end_time[i]), booking_limit[i], status[i]);
        placeholders.push('(?, ?, ?, ?, ?, ?)');
    }

    const query = `INSERT INTO ev_pre_sale_testing_slot (slot_id, slot_date, start_time, end_time, booking_limit, status) VALUES ${placeholders.join(', ')}`;
    const [insert] = await db.execute(query, values);

    return resp.json({
        code: 200,
        message: insert.affectedRows > 0 ? ['Time Slot added successfully!'] : ['Oops! Something went wrong. Please try again.'],
        status: insert.affectedRows > 0 ? 1 : 0
    });
});

// export const evPreSaleTimeSlotEdit = asyncHandler(async (req, resp) => {
//     const { id, slot_id, slot_date, slot_name, start_time, end_time, booking_limit, status } = req.body;
//     const { isValid, errors } = validateFields(req.body, { slot_id: ["required"], slot_date: ["required"], start_time: ["required"], end_time: ["required"], booking_limit: ["required"], });
//     if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
//     if ( !Array.isArray(slot_id) || !Array.isArray(start_time) || !Array.isArray(end_time) || !Array.isArray(booking_limit) || !Array.isArray(status)) {
//         return resp.json({ status: 0, code: 422, message: 'Input data must be in array format.' });
//     }
//     if ( start_time.length !== end_time.length || end_time.length !== booking_limit.length || booking_limit.length !== status.length) {
//         return resp.json({ status: 0, code: 422, message: 'All input arrays must have the same length.' });
//     }

//     let fSlotDate = moment(slot_date, "DD-MM-YYYY").format("YYYY-MM-DD"), updateResult, insertResult, errMsg = [];
//     for (let i = 0; i < start_time.length; i++) {
//         const updates = {
//             slot_date: fSlotDate,
//             start_time: convertTo24HourFormat(start_time[i]),
//             end_time: convertTo24HourFormat(end_time[i]),
//             booking_limit: booking_limit[i],
//             status: status[i]
//         };
        
//         if(slot_id[i]){
//             updateResult = await updateRecord("ev_pre_sale_testing_slot", updates, ["slot_id"], [slot_id[i]]);
//             if (updateResult.affectedRows === 0) errMsg.push(`Failed to update ${start_time[i]} for slot_date ${fSlotDate}.`);
//         }else{
//             const slotId = `PST${generateUniqueId({ length:6 })}`;
//             insertResult = await insertRecord("ev_pre_sale_testing_slot", ["slot_id", "slot_date", "start_time", "end_time", "booking_limit", "status"],[
//                 slotId, fSlotDate, convertTo24HourFormat(start_time[i]), convertTo24HourFormat(end_time[i]), booking_limit[i], status[i] 
//             ]);
//             if (insertResult.affectedRows === 0) errMsg.push(`Failed to add ${start_time[i]} for slot_date ${fSlotDate}.`);
//         }

//         if (errMsg.length > 0) {
//             return resp.json({ status: 0, code: 400, message: errMsg.join(" | ") });
//         }
//     }
        
//     return resp.json({ code: 200, message: "Slots updated successfully!", status: 1 });
// });


export const evPreSaleTimeSlotEdit = asyncHandler(async (req, resp) => {
    const { slot_id, slot_date, start_time, end_time, booking_limit, status } = req.body;
    const { isValid, errors } = validateFields(req.body, {
        slot_id       : ["required"],
        slot_date     : ["required"],
        start_time    : ["required"],
        end_time      : ["required"],
        booking_limit : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    if (!Array.isArray(slot_id) || !Array.isArray(start_time) || !Array.isArray(end_time) || !Array.isArray(booking_limit) || !Array.isArray(status)
    ) {
        return resp.json({ status: 0, code: 422, message: "Input data must be in array format." });
    }
    if (
        start_time.length !== end_time.length || end_time.length !== booking_limit.length || booking_limit.length !== status.length
    ) {
        return resp.json({ status: 0, code: 422, message: "All input arrays must have the same length." });
    }

    let fSlotDate = moment(slot_date, "DD-MM-YYYY").format("YYYY-MM-DD");
    let errMsg = [];

    //  Fetch existing slots for the given date
    const [existingSlots] = await db.execute("SELECT slot_id FROM ev_pre_sale_testing_slot WHERE slot_date = ?",[fSlotDate]);
    const existingSlotIds = existingSlots.map((slot) => slot.slot_id);

    // Determine slots to delete
    const slotsToDelete = existingSlotIds.filter((id) => !slot_id.includes(id));

    //Delete slots that are no longer needed
    for (let id of slotsToDelete) {
        const [deleteResult] = await db.execute("DELETE FROM ev_pre_sale_testing_slot WHERE slot_id = ?", [id] );

        if (deleteResult.affectedRows === 0) {
            errMsg.push(`Failed to delete slot with id ${id}.`);
        }
    }

    // Update or insert slots
    for (let i = 0; i < start_time.length; i++) {
        const updates = {
            slot_date: fSlotDate,
            start_time: convertTo24HourFormat(start_time[i]),
            end_time: convertTo24HourFormat(end_time[i]),
            booking_limit: booking_limit[i],
            status: status[i],
        };

        if (slot_id[i]) {
            // Update existing slot
            const [updateResult] = await db.execute(`UPDATE ev_pre_sale_testing_slot SET start_time = ?, end_time = ?, booking_limit = ?, status = ? 
                  WHERE slot_id = ? AND slot_date = ?`,
                [
                    updates.start_time,
                    updates.end_time,
                    updates.booking_limit,
                    updates.status,
                    slot_id[i],
                    fSlotDate,
                ]
            );
            if (updateResult.affectedRows === 0)
                errMsg.push(`Failed to update ${start_time[i]} for slot_date ${fSlotDate}.`);
        } else {
            // Insert new slot
            const newSlotId = `PST${generateUniqueId({ length: 6 })}`;
            const [insertResult] = await db.execute(`INSERT INTO ev_pre_sale_testing_slot (slot_id, slot_date, start_time, end_time, booking_limit, status)  VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    newSlotId,
                    fSlotDate,
                    updates.start_time,
                    updates.end_time,
                    updates.booking_limit,
                    updates.status,
                ]
            );
            if (insertResult.affectedRows === 0)
                errMsg.push(`Failed to add ${start_time[i]} for slot_date ${fSlotDate}.`);
        }
    }

    if (errMsg.length > 0) {
        return resp.json({ status: 0, code: 400, message: errMsg.join(" | ") });
    }

    return resp.json({ code: 200, message: "Slots updated successfully!", status: 1 });
});

export const evPreSaleTimeSlotDelete = asyncHandler(async (req, resp) => {
    const { slot_date }  = req.body;
    if (!slot_date) return resp.json({ status: 0, code: 422, message: "Slot Id is required." });

    const [del] = await db.execute('DELETE FROM ev_pre_sale_testing_slot WHERE slot_date = ?', [slot_date]);

    return resp.json({
        status: del.affectedRows > 0 ? 1 : 0,
        code: del.affectedRows > 0 ? 200 : 422,
        message: del.affectedRows > 0 ? "Time Slot Deleted Successfully" : "Failed to delete time slot.",
    }); 
});

