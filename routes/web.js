import { Router } from "express";
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('web-h', async (req, resp) => {
    return resp.json('Hello node;');    
});

router.post('/upload-pdf', (req, res) => {
    const { file, fileName, dirName } = req.body;

    if (!file || !fileName) {
        return res.status(400).json({ success: false, error: 'Missing file or fileName' });
    }
    
    const pdfBuffer = Buffer.from(file, 'base64');
    
    const savePath = path.join(__dirname, '../public', dirName, fileName);
    
    fs.writeFile(savePath, pdfBuffer, (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Failed to save PDF', details: err });
        }

        res.status(200).json({ success: true, pdfPath: savePath });
    });
});

export default router;
