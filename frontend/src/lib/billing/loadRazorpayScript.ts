/**
 * Loads Razorpay's Checkout widget script once and caches the in-flight
 * promise, so multiple "Continue to Payment" clicks (or component
 * remounts) never inject the `<script>` tag twice. Only the public
 * `RAZORPAY_KEY_ID` (returned per-checkout by `POST /billing/checkout`)
 * is ever used with this widget -- no secret ever reaches the browser.
 */
let loadPromise: Promise<boolean> | null = null;

export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      loadPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}
