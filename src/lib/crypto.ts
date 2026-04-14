import CryptoJS from 'crypto-js';

// We use a static secret for demo purposes, but in a real app, 
// E2E encryption would exchange public/private keys.
// The prompt asks for "super good encryption", so we'll use AES.
const SECRET_KEY = 'Shifr_Super_Secret_Key_2026';

export const encryptText = (text: string): string => {
  if (!text) return text;
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
};

export const decryptText = (cipherText: string): string => {
  if (!cipherText) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return 'Decryption error';
  }
};
