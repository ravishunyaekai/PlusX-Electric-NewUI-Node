import db from '../config/db.js';
import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const username = req.body.name.replace(/\s+/g, '-');
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `${username}-${timestamp}${ext}`);
    }
});

const upload = multer({ storage });

export const getUsers = async(req, resp)=>{
    const [rows] = await db.execute('SELECT * from users');
    resp.json(rows);
};

export const getUserById = async(req, resp)=>{
    const { id } = req.params;
    const [rows] = await db.execute('SELECT * from users where id = ?',[id]);
    if(rows.length === 0){
        return resp.status(404).json({ message:"User not found" });
    }
    resp.json(rows[0]);
};

export const create = async(req, resp)=>{
    const { name, email, phone } = req.body;
    const profileImg = req.file ? req.file.filename : null;
    const [result] = await db.execute('INSERT INTO users (name, email, phone, profile_img) VALUES (?,?,?,?)',[name, email, phone, profileImg]);
    resp.status(200).json({ id: result.insertId, name, message: "User Created Successfully" });
};

export const update = async(req, resp)=>{
    const { id } = req.params;
    const { name, email, phone } = req.body;
    const profileImg = req.file ? req.file.filename : null;
    const [result] = await db.execute('UPDATE users SET name=?, email=?, phone=?, profile_img=? WHERE id=?',[name, email, phone, profileImg, id]);
    if (result.affectedRows === 0) {
        return resp.status(404).json({ message: 'User not found' });
    }
    resp.json({message: 'User updated successfully'});
};

export const destroy = async(req, resp)=>{
    const { id } =  req.params;
    const [result] = await db.execute('DELETE FROM users where id=?',[id]);
    if (result.affectedRows === 0) {
        return resp.status(404).json({ message: 'User not found' });
    }
    resp.json({message: 'User deleted successfully'});
};

export const uploadProfileImage = upload.single('profileImg');