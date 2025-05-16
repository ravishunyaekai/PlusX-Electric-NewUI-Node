import db, { startTransaction, commitTransaction, rollbackTransaction } from "../../config/db.js";
import { getPaginatedData, queryDB  } from '../../dbUtils.js';
import { deleteFile,asyncHandler, formatDateTimeInQuery } from '../../utils.js';

export const discussionBoardList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;

    const result = await getPaginatedData({
        tableName: 'discussion_board',
        columns: `discussion_board.board_id, discussion_board.blog_title, discussion_board.description, discussion_board.image, 
                ${formatDateTimeInQuery(['discussion_board.created_at'])},
                (select rider_name from riders as r where r.rider_id = discussion_board.rider_id) as rider_name,
                (select rider_mobile from riders as r where r.rider_id = discussion_board.rider_id) as rider_mobile,
                (select profile_img from riders as r where r.rider_id = discussion_board.rider_id) as profile_img,
                (select count(id) from board_comment as bc where bc.board_id = discussion_board.board_id) as comment_count,
                (select count(id) from board_views as bv where bv.board_id = discussion_board.board_id) as view_count,
                (select count(id) from board_likes as bl where bl.board_id = discussion_board.board_id and status = 1) as likes_count,
                (select count(id) from board_share as bs where bs.board_id = discussion_board.board_id) as share_count`,
        joinTable        : 'riders',
        joinCondition    : 'discussion_board.rider_id = riders.rider_id',
        liveSearchFields : ['discussion_board.blog_title', 'discussion_board.board_id', 'riders.rider_name'],
        liveSearchTexts  : [search_text, search_text, search_text],
        sortColumn       : 'discussion_board.board_id',
        sortOrder        : 'DESC',
        page_no,
        limit: 10,
    });

    return resp.json({
        status: 1,
        code: 200,
        message: "Discussion Board List fetched successfully!",
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });
});



export const discussionBoardDetail = asyncHandler(async (req, resp) => {
    const { board_id } = req.body;
    if (!board_id) return resp.json({ status: 0, code: 422, message: "Board Id is required" });
    
    const board = await queryDB(`
        SELECT 
            board_id, rider_id, blog_title, description, image, ${formatDateTimeInQuery(['created_at'])}, 
            (select concat(rider_name, ",", rider_mobile, ",", country_code) from riders as r where r.rider_id = discussion_board.rider_id) as rider_data,
            (select count(id) from board_comment as bc where bc.board_id = discussion_board.board_id) as comment_count,
            (select count(id) from board_views as bv where bv.board_id = discussion_board.board_id) as view_count,
            (select count(id) from board_likes as bl where bl.board_id = discussion_board.board_id and status =1) as likes_count,
            (select count(id) from board_share as bs where bs.board_id = discussion_board.board_id) as share_count
        FROM 
            discussion_board 
        WHERE 
            board_id = ?
        LIMIT 1
    `, [board_id]);

    const [comments] = await db.execute(`
        SELECT 
            bc.comment_id, bc.comment,  ${formatDateTimeInQuery(['bc.created_at'])},
            CONCAT(r.rider_name, ",", r.rider_mobile, ",", r.country_code) AS rider_data
        FROM 
            board_comment AS bc
        LEFT JOIN 
            riders r 
        ON 
            r.rider_id = bc.rider_id
        WHERE 
            bc.board_id = ?
        ORDER BY 
            bc.id DESC
        LIMIT 1
    `, [board_id]);

    return resp.status(200).json({
        status: 1, 
        code: 200, 
        board, 
        comments, 
        base_url: `${req.protocol}://${req.get('host')}/uploads/discussion-board-images/`,
        message: "Discussion Board Detail fetch successfully!"});
});

export const discussionBoardDelete = asyncHandler(async (req, resp) => {
    const conn = await startTransaction();
    try{
        const { board_id } = req.body;
        if (!board_id) return resp.json({ status: 0, code: 422, message: "Board Id is required" });


        const board = await queryDB(`SELECT image FROM discussion_board WHERE board_id = ?`, [board_id]);
        if(!board) return resp.json({ status: 0, code: 422, message: "Invalid Board Id. Please Try Again." });
    
        await conn.execute(`DELETE FROM discussion_board WHERE board_id = ?`, [board_id]);
        await conn.execute(`DELETE FROM board_comment    WHERE board_id = ?`, [board_id]);
        await conn.execute(`DELETE FROM board_likes      WHERE board_id = ?`, [board_id]);
        await conn.execute(`DELETE FROM board_poll       WHERE board_id = ?`, [board_id]);
        await conn.execute(`DELETE FROM board_views      WHERE board_id = ?`, [board_id]);
        
        await commitTransaction(conn);
        
        if(board.image) deleteFile('discussion-board-images', board.image);
        
        return resp.json({status: 1, code:200, message: "Discussion Board deleted successfully!"});
        
    }catch(err){
        await rollbackTransaction(conn);
        console.error("Transaction failed:", err);
        return resp.status(500).json({status: 0, code: 500, message: "Oops! There is something went wrong! Please Try Again" });
    }finally{
        if (conn) conn.release();
    }
});
