const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'secret.key');
let ENCRYPTION_KEY;

try {
    if (fs.existsSync(keyPath)) {
        ENCRYPTION_KEY = fs.readFileSync(keyPath);
    } else {
        ENCRYPTION_KEY = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, ENCRYPTION_KEY);
    }
} catch (e) {
    ENCRYPTION_KEY = crypto.randomBytes(32);
}

const ALGORITHM = 'aes-256-cbc';

const encryptFile = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        
        const readStream = fs.createReadStream(inputPath);
        const writeStream = fs.createWriteStream(outputPath);

        readStream.pipe(cipher).pipe(writeStream)
            .on('finish', () => resolve(iv.toString('hex')))
            .on('error', reject);
    });
};

const getDecipherStream = (ivHex) => {
    const iv = Buffer.from(ivHex, 'hex');
    return crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
};

module.exports = { encryptFile, getDecipherStream };
