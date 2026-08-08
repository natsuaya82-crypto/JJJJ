// 点検スクリプト用の偽 @capacitor/core（ネイティブ扱いにして、ファイル保存の経路を通す）
export const Capacitor = { isNativePlatform: () => true }
