/**
 * withTimeout — bungkus promise Supabase dengan batas waktu.
 * Kalau request tidak selesai dalam `ms` milidetik, lempar error
 * sehingga catch block di caller bisa reset loading state & tampilkan pesan.
 */
export function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Koneksi timeout — coba lagi sebentar lagi.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
