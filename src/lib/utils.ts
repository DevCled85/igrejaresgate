import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatWhatsApp(phone: string) {
  const cleaned = ('' + phone).replace(/\D/g, '');
  return `https://wa.me/55${cleaned}`;
}

export function formatMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function generatePixPayload(key: string, amount: number, txid: string) {
  let cleanKey = key.trim();

  if (cleanKey.includes('@')) {
    // E-mail
  } else if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanKey)) {
    // Chave aleatória (EVP)
  } else {
    // CPF, CNPJ ou Celular (mantém o + se existir)
    cleanKey = cleanKey.replace(/[\s.()\-]/g, '');
  }

  const cleanAmount = amount.toFixed(2);
  const cleanName = 'N'; 
  const cleanCity = 'C'; 
  // TXID: Máximo 25 caracteres, apenas alfanuméricos
  const cleanTxid = txid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25).toUpperCase() || '***';

  const formatField = (id: string, value: string) => {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  };

  // ID 26 - Merchant Account Information
  const merchantAccountInfo = 
    formatField('00', 'BR.GOV.BCB.PIX') + 
    formatField('01', cleanKey);

  // ID 62 - Additional Data Field Template
  const additionalData = formatField('05', cleanTxid);

  let payload = 
    formatField('00', '01') + // Payload Format Indicator
    formatField('26', merchantAccountInfo) + // Merchant Account Info
    formatField('52', '0000') + // Merchant Category Code
    formatField('53', '986') + // Transaction Currency (BRL)
    formatField('54', cleanAmount) + // Transaction Amount
    formatField('58', 'BR') + // Country Code
    formatField('59', cleanName) + // Merchant Name
    formatField('60', cleanCity) + // Merchant City
    formatField('62', additionalData) + // Additional Data (TXID)
    '6304'; // CRC16 Identifier and Length

  // CRC16-CCITT (0x1021)
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');

  return payload + crcHex;
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise((res) => {
      try {
        const success = document.execCommand('copy');
        res(success);
      } catch (err) {
        console.error('Fallback copy failed:', err);
        res(false);
      }
      document.body.removeChild(textArea);
    });
  }
}
