import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

export const multerStorage = diskStorage({
  destination: './public/uploads',
  filename: (req, file, cb) => {
    const ext = extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

export const multerConfig = {
  storage: multerStorage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
};

export const multerAnyFilesConfig = {
  storage: multerStorage,
  limits: {
    files: 10,
    fileSize: 50 * 1024 * 1024,
  },
};
