const PLACEHOLDER_PATTERN = /replace[-_]?me/i;

/** True when a Stripe key looks like an unset `.env.example` placeholder. */
export function isPlaceholderStripeKey(key: string | undefined | null): boolean {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) return true;
  if (PLACEHOLDER_PATTERN.test(trimmed)) return true;
  return !/^(pk|sk)_(test|live)_[A-Za-z0-9]+$/.test(trimmed);
}

/** Account segment shared by matching publishable + secret key pairs. */
export function stripeKeyAccountPrefix(key: string): string | null {
  const match = key.trim().match(/^(?:pk|sk)_(?:test|live)_([A-Za-z0-9]+)/);
  return match?.[1]?.slice(0, 16) ?? null;
}

export function isPlatformStripePublishableKeyConfigured(
  key: string | undefined | null = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
): key is string {
  return !isPlaceholderStripeKey(key);
}

export function isPlatformStripeSecretKeyConfigured(
  key: string | undefined | null = process.env.STRIPE_SECRET_KEY,
): key is string {
  return !isPlaceholderStripeKey(key);
}

export function platformStripePublishableKeyIssue(
  publishableKey: string | undefined | null = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  secretKey: string | undefined | null = process.env.STRIPE_SECRET_KEY,
): string | null {
  if (!isPlatformStripePublishableKeyConfigured(publishableKey)) {
    return (
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing or still set to the placeholder. " +
      "Copy the publishable key (pk_test_…) from Stripe Dashboard → Developers → API keys " +
      "into .env, then restart the dev server."
    );
  }

  if (isPlatformStripeSecretKeyConfigured(secretKey)) {
    const pkPrefix = stripeKeyAccountPrefix(publishableKey!);
    const skPrefix = stripeKeyAccountPrefix(secretKey!);
    if (pkPrefix && skPrefix && pkPrefix !== skPrefix) {
      return (
        "Stripe publishable and secret keys appear to be from different accounts. " +
        "Use the matching key pair from the same Stripe Dashboard → Developers → API keys page."
      );
    }
  }

  return null;
}
