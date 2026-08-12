'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha, useTheme } from '@mui/material/styles';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogContent from '@mui/material/DialogContent';

import { billingApi, type ModuleCatalogEntry, type BillingCycle, type BillingQuote, type SubscriptionBillingMode } from '@/lib/api/billing.api';
import { loadRazorpayScript } from '@/lib/billing/loadRazorpayScript';
import { useAuthStore } from '@/lib/store/auth.store';
import ModuleCard from '../_components/ModuleCard';
import ConfigurationSummary, { type SelectedModuleItem } from '../_components/ConfigurationSummary';
import ModuleManagementDialog from '../_components/ModuleManagementDialog';
import PendingChangeDialog from '../_components/PendingChangeDialog';
import PaymentStatusDialog, { type PaymentStage } from '../_components/PaymentStatusDialog';
import StepHeader from '../_components/StepHeader';
import TrustBadgesRow from '../_components/TrustBadgesRow';

const QUOTE_DEBOUNCE_MS = 500;

// Rotating accent palette for module icon chips -- purely cosmetic, cycles
// by catalog order so the grid reads as varied/colorful without any
// per-module config on the backend.
const ACCENT_PALETTE = ['#2563EB', '#7C3AED', '#059669', '#DB2777', '#D97706', '#0891B2'];

const dateLabel = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/**
 * Subscribe -- purchase a NEW subscription, reactivate a lapsed one, or
 * add genuinely NEW modules to an existing one. Deliberately the ONLY
 * page in the billing IA that talks to quote/checkout/payment -- My
 * Subscription and Billing History never touch those APIs.
 *
 * Subscription Change Management: the page NEVER infers which billing
 * journey applies from `subscription.status` locally -- it reads
 * `subscription.billingMode`, computed server-side by
 * BillingSubscriptionService.determineBillingMode(), and branches on
 * exactly that:
 *   - NEW_SUBSCRIPTION: no prior paid subscription. Classic
 *     quote -> checkout -> Razorpay flow, "Continue to Payment".
 *   - ACTIVE_SUBSCRIPTION: an open paid subscription exists. Subscription
 *     upgrade strategy: new modules go through the SAME quote -> checkout
 *     -> Razorpay pipeline, charged in full immediately at the
 *     subscription's current cycle price (no proration, billing cycle
 *     itself can't be changed this way) -- "Continue to Payment", no
 *     "next renewal" / "no payment due" copy. The backend tags this a
 *     MODULE_ADDITION quote and, post-payment, ADDS the new items without
 *     touching what's already licensed or resetting the billing period.
 *     Only module REMOVALS remain deferred, via POST
 *     /billing/subscription/changes ("Schedule Removal" on a LICENSED
 *     card's management dialog), effective at the next renewal.
 *   - REACTIVATION: the tenant's last subscription was paid before but is
 *     now fully cancelled. Same quote -> checkout -> Razorpay mechanics as
 *     NEW_SUBSCRIPTION, but "Reactivate Subscription" and no "next
 *     renewal" / "no payment due" copy -- this charge is immediate.
 *
 * Already-licensed modules are never purchasable in any mode -- the
 * catalog's per-tenant `licenseState` (LICENSED/PENDING_ADD/
 * PENDING_REMOVAL) routes a click to a read-only management/pending
 * dialog instead of the cart.
 */
export default function SubscribePage() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const user = useAuthStore((s) => s.user);

  const { data: modules, isLoading: modulesLoading, isError: modulesError } = useQuery({
    queryKey: ['billing', 'modules'],
    queryFn: billingApi.listModules,
  });

  const { data: subscription } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: billingApi.getSubscription,
  });

  const { data: changes } = useQuery({
    queryKey: ['billing', 'subscription', 'changes'],
    queryFn: billingApi.listSubscriptionChanges,
  });

  // Default to NEW_SUBSCRIPTION while `subscription` is still loading --
  // the safest guess (checkout mode) since it never withholds a payment
  // that a fresh tenant needs to make; the moment the real billingMode
  // arrives, everything below re-renders against it.
  const billingMode: SubscriptionBillingMode = subscription?.billingMode ?? 'NEW_SUBSCRIPTION';
  // Subscription upgrade strategy: ACTIVE_SUBSCRIPTION no longer means
  // "defer new modules to renewal" -- it means "purchase modules on top of
  // an already-open subscription, charged in full right now, no
  // proration" (BillingQuoteType.MODULE_ADDITION on the backend). Only
  // module REMOVALS remain deferred (handled separately, via
  // ModuleManagementDialog's "Schedule Removal" on a LICENSED card).
  const isAdditionPurchase = billingMode === 'ACTIVE_SUBSCRIPTION';
  const isReactivation = billingMode === 'REACTIVATION';
  const renewalDateLabel = dateLabel(subscription?.currentPeriodEnd);

  const prefillModules = useMemo(() => {
    const raw = searchParams.get('modules');
    return raw ? raw.split(',').filter(Boolean) : null;
  }, [searchParams]);
  const prefillCycle = searchParams.get('cycle') as BillingCycle | null;

  const [billingCycle, setBillingCycle] = useState<BillingCycle>(prefillCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
  const [selected, setSelected] = useState<string[]>(prefillModules ?? []);
  // Per-module prepayment: codes queued from a LICENSED module's "Buy More
  // Months" (ModuleManagementDialog), and each cart line's chosen duration
  // (billing-cycle units -- months for MONTHLY, years for YEARLY). Default
  // 1 for anything not explicitly set.
  const [extending, setExtending] = useState<string[]>([]);
  const [monthsByCode, setMonthsByCode] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [managementModule, setManagementModule] = useState<ModuleCatalogEntry | null>(null);
  const [scheduleRemovalLoading, setScheduleRemovalLoading] = useState(false);
  const [pendingModule, setPendingModule] = useState<ModuleCatalogEntry | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const coreModules = useMemo(() => (modules || []).filter((m) => m.isCore), [modules]);
  const purchasableModules = useMemo(() => (modules || []).filter((m) => !m.isCore), [modules]);
  const allSelectedCodes = useMemo(
    () => [...coreModules.map((m) => m.code), ...selected],
    [coreModules, selected],
  );

  // Defense in depth: a code can only ever sit in the cart while its
  // server-reported licenseState is NOT_LICENSED or EXPIRED (the only
  // states ModuleCard's own onClick ever routes to onToggle). This prunes
  // anything else out -- e.g. a `?modules=` deep link naming an
  // already-licensed code -- the instant the catalog loads, so a stale/
  // manually-crafted URL can never let an already-licensed or
  // already-pending module quietly ride along into a quote or a
  // scheduled change.
  useEffect(() => {
    if (!modules) return;
    const purchasableCodes = new Set(
      modules.filter((m) => !m.isCore && (m.licenseState === 'NOT_LICENSED' || m.licenseState === 'EXPIRED')).map((m) => m.code),
    );
    setSelected((prev) => prev.filter((c) => purchasableCodes.has(c)));
    // Same defense in depth for the "buy more months" queue -- it may only
    // ever contain codes that are currently LICENSED (the only state
    // ModuleManagementDialog's "Add to Cart" is reachable from).
    const licensedCodes = new Set(modules.filter((m) => !m.isCore && m.licenseState === 'LICENSED').map((m) => m.code));
    setExtending((prev) => prev.filter((c) => licensedCodes.has(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules]);

  // A module-addition purchase is always priced at the EXISTING
  // subscription's own billing cycle -- the toggle is hidden in that mode
  // (see ConfigurationSummary's showBillingCycleToggle), but keep the
  // local `billingCycle` state in sync with it anyway so quote requests
  // below always use the right cycle even before the toggle would have
  // rendered.
  useEffect(() => {
    if (isAdditionPurchase && subscription?.billingCycle) {
      setBillingCycle(subscription.billingCycle);
    }
  }, [isAdditionPurchase, subscription?.billingCycle]);

  // Codes to quote/checkout: a module-addition purchase prices the NEW
  // modules plus anything queued for a months-extension (core is already
  // licensed -- re-requesting it is harmless server-side now, since an
  // already-licensed code is classified as an extension rather than
  // rejected, but it's still never sent here as it has nothing to do with
  // this tenant's purchase); a new subscription or reactivation prices
  // core + everything selected, since nothing is licensed yet.
  const codesToQuote = useMemo(
    () => (isAdditionPurchase ? [...selected, ...extending] : allSelectedCodes),
    [isAdditionPurchase, selected, extending, allSelectedCodes],
  );
  const monthsFor = (code: string) => monthsByCode[code] ?? 1;

  // Live server-calculated quote -- runs for ALL three billing journeys
  // now (subscription upgrade strategy change: module additions on an
  // already-open subscription are charged immediately, same quote ->
  // checkout -> Razorpay pipeline as a new subscription, never deferred).
  useEffect(() => {
    if (!modules) {
      setQuote(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (codesToQuote.length === 0) {
      setQuote(null);
      return;
    }

    setIsCalculating(true);
    setQuoteError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const q = await billingApi.createQuote(billingCycle, codesToQuote.map((code) => ({ code, months: monthsFor(code) })));
        setQuote(q);
      } catch (err: any) {
        setQuote(null);
        setQuoteError(err?.response?.data?.message || 'Unable to calculate pricing.');
      } finally {
        setIsCalculating(false);
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingCycle, JSON.stringify(codesToQuote), JSON.stringify(monthsByCode), modules]);

  const toggleModule = (code: string) => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };
  const removeModule = (code: string) => {
    setSelected((prev) => prev.filter((c) => c !== code));
    setExtending((prev) => prev.filter((c) => c !== code));
  };
  const removeAllModules = () => {
    setSelected([]);
    setExtending([]);
  };
  const changeMonths = (code: string, delta: number) => {
    setMonthsByCode((prev) => ({ ...prev, [code]: Math.min(24, Math.max(1, (prev[code] ?? 1) + delta)) }));
  };
  const handleAddMonthsToCart = (code: string, months: number) => {
    setMonthsByCode((prev) => ({ ...prev, [code]: months }));
    setExtending((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setManagementModule(null);
  };

  // Full cart display (core + addons) -- used for NEW_SUBSCRIPTION/REACTIVATION,
  // where nothing is licensed yet so the whole workspace is being purchased.
  const selectedItems: SelectedModuleItem[] = useMemo(() => {
    const priceFor = (m: ModuleCatalogEntry) => (billingCycle === 'MONTHLY' ? m.monthlyPrice : m.yearlyPrice);
    const core = coreModules.map((m) => ({ code: m.code, name: m.name, price: priceFor(m), isCore: true, months: 1 }));
    const addons = purchasableModules
      .filter((m) => selected.includes(m.code))
      .map((m) => ({ code: m.code, name: m.name, price: priceFor(m), isCore: false, months: monthsFor(m.code) }));
    return [...core, ...addons];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreModules, purchasableModules, selected, billingCycle, monthsByCode]);

  // Addition-purchase cart display -- WITHOUT core modules, since an
  // existing subscriber's new-module cart never includes PLATFORM (it's
  // already licensed, never something they're "adding" or paying for
  // again). Includes both freshly-selected (new purchase) and `extending`
  // (buy-more-months on an already-LICENSED module, queued from
  // ModuleManagementDialog) codes -- both go through the exact same
  // quote/checkout pipeline, just labeled differently.
  const additionItems: SelectedModuleItem[] = useMemo(() => (
    purchasableModules
      .filter((m) => selected.includes(m.code) || extending.includes(m.code))
      .map((m) => ({
        code: m.code, name: m.name, price: billingCycle === 'MONTHLY' ? m.monthlyPrice : m.yearlyPrice,
        isCore: false, months: monthsFor(m.code), isExtension: extending.includes(m.code),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [purchasableModules, selected, extending, billingCycle, monthsByCode]);

  const cartItems = isAdditionPurchase ? additionItems : selectedItems;

  const stepHeaderActive: 1 | 2 | 3 = checkoutLoading || paymentStage !== 'idle' ? 3 : (selected.length > 0 || extending.length > 0) ? 2 : 1;

  const invalidateModuleState = () => {
    queryClient.invalidateQueries({ queryKey: ['billing', 'modules'] });
    queryClient.invalidateQueries({ queryKey: ['billing', 'subscription', 'changes'] });
  };

  const handleContinue = async () => {
    if (!quote) return;
    setCheckoutLoading(true);
    setPaymentStage('opening_checkout');
    setPaymentError(null);
    try {
      const [checkout, scriptLoaded] = await Promise.all([
        billingApi.createCheckout(quote.id),
        loadRazorpayScript(),
      ]);
      if (!scriptLoaded) {
        throw new Error("We couldn't start the payment. Please try again.");
      }

      const rzp = new (window as any).Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: Math.round(checkout.amount * 100),
        currency: checkout.currency,
        name: 'ZoeConnect',
        description: 'ZoeConnect Subscription',
        prefill: { name: user?.fullName, email: user?.email },
        theme: { color: theme.palette.primary.main },
        handler: async (response: any) => {
          setPaymentStage('verifying');
          try {
            await billingApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setPaymentStage('activating');
            await refreshAfterPayment();
            clearCart();
            setPaymentStage('success');
          } catch (err: any) {
            // Verification failed synchronously -- but the webhook may
            // still confirm it shortly, so this is "pending", not "failed".
            setPaymentStage('pending');
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentStage('idle');
            setCheckoutLoading(false);
          },
        },
      });
      rzp.on('payment.failed', () => {
        setPaymentError('Payment was not completed.');
        setPaymentStage('failed');
      });
      rzp.open();
    } catch (err: any) {
      setPaymentError(err?.response?.data?.message || err?.message || "We couldn't start the payment. Please try again.");
      setPaymentStage('failed');
    } finally {
      setCheckoutLoading(false);
    }
  };

  /**
   * A module-addition purchase never changes `subscription.status` (it
   * stays whatever open status it already was -- ACTIVE/PAST_DUE/
   * CANCEL_AT_PERIOD_END/SUSPENDED), so polling for a flip to literal
   * 'ACTIVE' would spin all 5 attempts and give up for a PAST_DUE/
   * CANCEL_AT_PERIOD_END/SUSPENDED tenant purchasing an addition. Entitlement
   * sync already ran synchronously inside the same DB transaction as the
   * payment confirmation (see PaymentConfirmedWorkflow), so a single
   * refetch is always enough here -- no polling needed.
   */
  async function refreshAfterPayment() {
    if (isAdditionPurchase) {
      const sub = await billingApi.getSubscription();
      queryClient.setQueryData(['billing', 'subscription'], sub);
      invalidateLicenseStatus();
      invalidateModuleState();
      return;
    }
    await refreshSubscriptionUntilActive();
  }

  async function refreshSubscriptionUntilActive() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sub = await billingApi.getSubscription();
      if (sub.status === 'ACTIVE') {
        queryClient.setQueryData(['billing', 'subscription'], sub);
        invalidateLicenseStatus();
        return;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  /**
   * Bug fix: a successful payment runs BillingEntitlementSyncService
   * synchronously on the backend (subscription_licenses is updated inside
   * the same transaction as the payment/subscription/invoice writes --
   * see PaymentConfirmedWorkflow), so GET /license/status is correct the
   * instant checkout completes. But the license banner
   * (components/LicenseBanner.tsx, mounted once in the platform layout)
   * and the dashboard's module grid both read the SAME react-query key
   * (['license-status']) with a 5-minute staleTime/refetchInterval, and
   * nothing on this page was invalidating it -- so a tenant who just paid
   * kept seeing "license expired" and a stale module list for up to five
   * minutes, purely a stale client cache, not a backend/entitlement-sync
   * problem. settings/license/page.tsx already invalidates this same key
   * after its own license actions; this page just never did.
   */
  const invalidateLicenseStatus = () => {
    queryClient.invalidateQueries({ queryKey: ['license-status'] });
  };

  /** Clears the cart (new selections + queued month-extensions) after a successful purchase -- the modules query is about to be invalidated/refetched anyway, so nothing here needs to survive. */
  const clearCart = () => {
    setSelected([]);
    setExtending([]);
    setMonthsByCode({});
  };

  const handleClosePaymentDialog = () => setPaymentStage('idle');
  const handleRetryPayment = () => {
    setPaymentStage('idle');
    handleContinue();
  };
  const handleRefreshStatus = async () => {
    // A module-addition purchase never flips `subscription.status` --
    // check whether the modules just bought have actually become LICENSED
    // instead (the real signal a webhook-confirmed addition payment
    // landed).
    if (isAdditionPurchase) {
      const freshModules = await billingApi.listModules();
      queryClient.setQueryData(['billing', 'modules'], freshModules);
      const allLicensed = codesToQuote.every((code) => freshModules.find((m) => m.code === code)?.licenseState === 'LICENSED');
      if (allLicensed) {
        clearCart();
        setPaymentStage('success');
        invalidateLicenseStatus();
        invalidateModuleState();
      }
      return;
    }
    const sub = await billingApi.getSubscription();
    queryClient.setQueryData(['billing', 'subscription'], sub);
    if (sub.status === 'ACTIVE') {
      clearCart();
      setPaymentStage('success');
      invalidateLicenseStatus();
    }
  };
  const handleEnter = () => {
    setPaymentStage('idle');
    queryClient.invalidateQueries({ queryKey: ['billing'] });
    invalidateLicenseStatus();
    router.push('/settings/billing/subscription');
  };

  const openManagement = (module: ModuleCatalogEntry) => setManagementModule(module);
  const closeManagement = () => setManagementModule(null);
  const handleScheduleRemoval = async () => {
    if (!managementModule) return;
    setScheduleRemovalLoading(true);
    try {
      await billingApi.createSubscriptionChange(managementModule.code, 'REMOVE');
      enqueueSnackbar(`${managementModule.name} will be removed on ${renewalDateLabel ?? 'your next renewal'}.`, { variant: 'info' });
      invalidateModuleState();
      setManagementModule(null);
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Could not schedule removal.', { variant: 'error' });
    } finally {
      setScheduleRemovalLoading(false);
    }
  };

  const openPending = (module: ModuleCatalogEntry) => setPendingModule(module);
  const closePending = () => setPendingModule(null);
  const handleUndoPending = async () => {
    if (!pendingModule) return;
    const change = (changes ?? []).find((c) => c.moduleCode === pendingModule.code && c.status === 'PENDING');
    if (!change) {
      enqueueSnackbar('This change could not be found -- it may have already been applied or cancelled.', { variant: 'error' });
      setPendingModule(null);
      return;
    }
    setUndoLoading(true);
    try {
      await billingApi.cancelSubscriptionChange(change.id);
      enqueueSnackbar(`Scheduled change for ${pendingModule.name} was cancelled.`, { variant: 'info' });
      invalidateModuleState();
      setPendingModule(null);
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Could not cancel this change.', { variant: 'error' });
    } finally {
      setUndoLoading(false);
    }
  };

  const mobileTotalLabel = quote
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: quote.currency, maximumFractionDigits: 0 }).format(quote.total)
    : '—';
  const mobileDisabled = !quote || checkoutLoading;
  const mobileButtonLabel = isReactivation ? 'Reactivate' : isAdditionPurchase ? 'Purchase' : 'Continue';
  const checkoutCtaLabel = isReactivation ? 'Reactivate Subscription' : 'Continue to Payment';
  const checkoutCtaLoadingLabel = isReactivation ? 'Reactivating your subscription...' : 'Preparing secure checkout...';
  // Sidebar titles/copy are mode-specific per the billing lifecycle spec --
  // never a single generic string reused across all three journeys.
  const sidebarTitle = isReactivation ? 'Reactivate Subscription' : isAdditionPurchase ? 'New Module Purchase' : 'Your New Subscription';
  const activationLabel = isReactivation
    ? 'Immediately after payment'
    : isAdditionPurchase
      ? 'Available immediately after payment'
      : 'Immediately after successful payment';

  return (
    <Box sx={{ minHeight: '100%', pb: isMobile ? 12 : 4 }}>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          bgcolor: theme.palette.background.paper,
          borderBottom: `1px solid ${theme.palette.divider}`,
          py: { xs: 1.5, md: 2 },
          mb: 4,
        }}
      >
        <Box
          sx={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(60% 100% at 15% 0%, ${alpha(theme.palette.primary.main, 0.07)} 0%, transparent 60%),
                         radial-gradient(50% 100% at 85% 0%, ${alpha(theme.palette.secondary.main, 0.06)} 0%, transparent 60%)`,
          }}
        />
        <Container maxWidth="lg" sx={{ position: 'relative' }}>
          <StepHeader activeStep={stepHeaderActive} />
        </Container>
      </Box>

      <Container maxWidth="lg">
        <Grid container spacing={4}>
          <Grid item xs={12} md={8}>
            <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1}>
              Available Modules
            </Typography>

            {modulesError && (
              <Alert severity="error" sx={{ mt: 2, mb: 2, borderRadius: 2 }}>
                Unable to load the module catalog. Please refresh the page.
              </Alert>
            )}

            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {modulesLoading && Array.from({ length: 8 }).map((_, i) => (
                <Grid item xs={6} sm={4} md={3} key={i}>
                  <Skeleton variant="rounded" height={68} sx={{ borderRadius: 3 }} />
                </Grid>
              ))}

              {coreModules.map((m) => (
                <Grid item xs={6} sm={4} md={3} key={m.code}>
                  <ModuleCard
                    module={m}
                    billingCycle={billingCycle}
                    selected={false}
                    onToggle={() => {}}
                    onManage={() => {}}
                    onViewPending={() => {}}
                  />
                </Grid>
              ))}

              {purchasableModules.map((m, idx) => (
                <Grid item xs={6} sm={4} md={3} key={m.code}>
                  <ModuleCard
                    module={m}
                    billingCycle={billingCycle}
                    selected={selected.includes(m.code)}
                    onToggle={toggleModule}
                    onManage={openManagement}
                    onViewPending={openPending}
                    accentColor={ACCENT_PALETTE[idx % ACCENT_PALETTE.length]}
                  />
                </Grid>
              ))}
            </Grid>

            {quoteError && (
              <Alert severity="error" sx={{ mt: 3, borderRadius: 2 }}>{quoteError}</Alert>
            )}

            <Box sx={{ display: { xs: 'none', md: 'block' }, mt: 6, pt: 4, borderTop: `1px solid ${theme.palette.divider}` }}>
              <TrustBadgesRow />
            </Box>
          </Grid>

          {/* Desktop: sticky sidebar. Mobile: hidden here, shown as a bottom bar below. */}
          <Grid item md={4} sx={{ display: { xs: 'none', md: 'block' } }}>
            <ConfigurationSummary
              quote={quote}
              isCalculating={isCalculating}
              onContinue={handleContinue}
              continueDisabled={!quote}
              continueLoading={checkoutLoading}
              items={cartItems}
              onRemove={removeModule}
              onRemoveAll={removeAllModules}
              onMonthsChange={changeMonths}
              billingCycle={billingCycle}
              onBillingCycleChange={setBillingCycle}
              ctaLabel={checkoutCtaLabel}
              ctaLoadingLabel={checkoutCtaLoadingLabel}
              title={sidebarTitle}
              activationLabel={activationLabel}
              showBillingCycleToggle={!isAdditionPurchase}
            />
          </Grid>
        </Grid>

        <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 5, pt: 4, borderTop: `1px solid ${theme.palette.divider}`, pb: 4 }}>
          <TrustBadgesRow />
        </Box>
      </Container>

      {/* Mobile sticky bottom bar */}
      {isMobile && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: theme.zIndex.appBar,
            p: 2, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
          }}
        >
          <Box onClick={() => setMobileSummaryOpen(true)} sx={{ cursor: 'pointer' }}>
            <Typography variant="caption" color="text.secondary">
              {isAdditionPurchase ? 'Total due today' : `Total (${billingCycle === 'MONTHLY' ? 'monthly' : 'yearly'})`}
            </Typography>
            <Typography variant="h6" fontWeight={800}>{mobileTotalLabel}</Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            disabled={mobileDisabled}
            onClick={handleContinue}
            sx={{ borderRadius: 2.5, fontWeight: 700, px: 3 }}
          >
            {mobileButtonLabel}
          </Button>
        </Paper>
      )}

      <ResponsiveDialog open={mobileSummaryOpen} onClose={() => setMobileSummaryOpen(false)} maxWidth="sm" fullWidth>
        <DialogContent>
          <ConfigurationSummary
            quote={quote}
            isCalculating={isCalculating}
            onContinue={() => { setMobileSummaryOpen(false); handleContinue(); }}
            continueDisabled={!quote}
            continueLoading={checkoutLoading}
            items={cartItems}
            onRemove={removeModule}
            onRemoveAll={removeAllModules}
            onMonthsChange={changeMonths}
            billingCycle={billingCycle}
            onBillingCycleChange={setBillingCycle}
            ctaLabel={checkoutCtaLabel}
            ctaLoadingLabel={checkoutCtaLoadingLabel}
            title={sidebarTitle}
            activationLabel={activationLabel}
            showBillingCycleToggle={!isAdditionPurchase}
          />
        </DialogContent>
      </ResponsiveDialog>

      <PaymentStatusDialog
        stage={paymentStage}
        onClose={handleClosePaymentDialog}
        onRetry={handleRetryPayment}
        onRefreshStatus={handleRefreshStatus}
        onEnter={handleEnter}
        errorMessage={paymentError}
      />

      <ModuleManagementDialog
        open={!!managementModule}
        module={managementModule}
        billingCycle={subscription?.billingCycle ?? billingCycle}
        renewalDateLabel={renewalDateLabel}
        onClose={closeManagement}
        onScheduleRemoval={handleScheduleRemoval}
        loading={scheduleRemovalLoading}
        onAddMonthsToCart={handleAddMonthsToCart}
        alreadyInCart={managementModule ? extending.includes(managementModule.code) : false}
      />

      <PendingChangeDialog
        open={!!pendingModule}
        module={pendingModule}
        onClose={closePending}
        onUndo={handleUndoPending}
        loading={undoLoading}
      />
    </Box>
  );
}
