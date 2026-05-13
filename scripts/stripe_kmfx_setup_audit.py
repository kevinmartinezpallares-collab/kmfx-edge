#!/usr/bin/env python3
"""Audit and optionally repair the KMFX Stripe product setup.

Default mode is read-only. To update Price lookup keys/metadata, pass
--apply-price-metadata with STRIPE_SECRET_KEY in the environment.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


STRIPE_API_BASE = "https://api.stripe.com/v1"
DEFAULT_PRODUCT_ID = "prod_UT7nzmgj3Eg3Zv"
DEFAULT_WEBHOOK_URL = "https://kmfx-edge-api.onrender.com/api/billing/webhook"
DEFAULT_API_VERSION = "2026-02-25.clover"


@dataclass(frozen=True)
class ExpectedPrice:
    env_name: str
    price_id: str
    lookup_key: str
    plan: str
    interval: str
    amount: int
    currency: str = "eur"


EXPECTED_PRICES = [
    ExpectedPrice(
        env_name="STRIPE_PRICE_CORE_MONTHLY",
        price_id="price_1TUBYUEoC6e7wNItXEGCdVZ4",
        lookup_key="kmfx_basic_monthly",
        plan="core",
        interval="month",
        amount=1500,
    ),
    ExpectedPrice(
        env_name="STRIPE_PRICE_CORE_YEARLY",
        price_id="price_1TUC1ZEoC6e7wNItpQF7UGPA",
        lookup_key="kmfx_basic_yearly",
        plan="core",
        interval="year",
        amount=15000,
    ),
    ExpectedPrice(
        env_name="STRIPE_PRICE_PRO_MONTHLY",
        price_id="price_1TULXwEoC6e7wNItP3e4pCh4",
        lookup_key="kmfx_pro_monthly",
        plan="pro",
        interval="month",
        amount=2500,
    ),
    ExpectedPrice(
        env_name="STRIPE_PRICE_PRO_YEARLY",
        price_id="price_1TULY0EoC6e7wNItYVKQKHIi",
        lookup_key="kmfx_pro_yearly",
        plan="pro",
        interval="year",
        amount=25000,
    ),
    ExpectedPrice(
        env_name="STRIPE_PRICE_UNLIMITED_MONTHLY",
        price_id="price_1TUC5uEoC6e7wNItcPyjGy5Z",
        lookup_key="kmfx_unlimited_monthly",
        plan="unlimited",
        interval="month",
        amount=3900,
    ),
    ExpectedPrice(
        env_name="STRIPE_PRICE_UNLIMITED_YEARLY",
        price_id="price_1TUC65EoC6e7wNItBfoMCblt",
        lookup_key="kmfx_unlimited_yearly",
        plan="unlimited",
        interval="year",
        amount=39000,
    ),
]


def env_value(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def stripe_secret_key() -> str:
    return env_value("STRIPE_SECRET_KEY", "KMFX_STRIPE_SECRET_KEY")


def stripe_request(method: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    secret = stripe_secret_key()
    if not secret:
        raise RuntimeError("STRIPE_SECRET_KEY is required for Stripe API checks")
    headers = {
        "Authorization": f"Bearer {secret}",
        "Stripe-Version": env_value("STRIPE_API_VERSION", "KMFX_STRIPE_API_VERSION") or DEFAULT_API_VERSION,
    }
    url = f"{STRIPE_API_BASE}{path}"
    encoded = None
    if method == "GET":
        query = urllib.parse.urlencode(params or {}, doseq=True)
        if query:
            url = f"{url}?{query}"
    else:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        encoded = urllib.parse.urlencode(params or {}, doseq=True).encode("utf-8")
    request = urllib.request.Request(url, data=encoded, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Stripe API error {exc.code}: {details[:500]}") from exc


def list_all(path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    next_params = dict(params)
    while True:
        payload = stripe_request("GET", path, next_params)
        batch = payload.get("data")
        if isinstance(batch, list):
            items.extend(item for item in batch if isinstance(item, dict))
        if not payload.get("has_more") or not batch:
            return items
        next_params["starting_after"] = batch[-1].get("id")


def expected_price_id(price: ExpectedPrice) -> str:
    configured = env_value(price.env_name, f"KMFX_{price.env_name}")
    if configured.startswith("price_"):
        return configured
    return price.price_id


def expected_price_ids() -> set[str]:
    return {expected_price_id(price) for price in EXPECTED_PRICES}


def audit_product(product_id: str) -> list[str]:
    issues: list[str] = []
    product = stripe_request("GET", f"/products/{urllib.parse.quote(product_id)}")
    metadata = product.get("metadata") or {}
    if product.get("id") != product_id:
        issues.append(f"product:mismatched_id:{product_id}")
    if product.get("active") is not True:
        issues.append(f"product:not_active:{product_id}")
    if metadata.get("app") != "kmfx_edge":
        issues.append(f"product_mismatch:{product_id}:metadata.app")
    if metadata.get("billing_model") != "subscription":
        issues.append(f"product_mismatch:{product_id}:metadata.billing_model")
    return issues


def audit_prices(product_id: str, *, apply: bool = False) -> list[str]:
    issues: list[str] = []
    prices = {price.get("id"): price for price in list_all("/prices", {"product": product_id, "limit": 100})}
    for expected in EXPECTED_PRICES:
        price_id = expected_price_id(expected)
        price = prices.get(price_id)
        if not price:
            issues.append(f"missing_price:{expected.env_name}:{price_id}")
            continue
        recurring = price.get("recurring") or {}
        metadata = price.get("metadata") or {}
        checks = {
            "product": price.get("product") == product_id,
            "amount": price.get("unit_amount") == expected.amount,
            "currency": price.get("currency") == expected.currency,
            "interval": recurring.get("interval") == expected.interval,
            "lookup_key": price.get("lookup_key") == expected.lookup_key,
            "metadata.app": metadata.get("app") == "kmfx_edge",
            "metadata.plan_key": metadata.get("plan_key") == expected.plan,
            "metadata.commercial_plan": metadata.get("commercial_plan") == ("basic" if expected.plan == "core" else expected.plan),
            "metadata.interval": metadata.get("interval") == expected.interval,
            "metadata.billing_interval": metadata.get("billing_interval") == expected.interval,
        }
        for name, ok in checks.items():
            if not ok:
                issues.append(f"price_mismatch:{price_id}:{name}")
        if apply and (
            price.get("lookup_key") != expected.lookup_key
            or metadata.get("app") != "kmfx_edge"
            or metadata.get("plan_key") != expected.plan
            or metadata.get("billing_interval") != expected.interval
        ):
            stripe_request(
                "POST",
                f"/prices/{urllib.parse.quote(price_id)}",
                {
                    "lookup_key": expected.lookup_key,
                    "transfer_lookup_key": "true",
                    "metadata[app]": "kmfx_edge",
                    "metadata[plan_key]": expected.plan,
                    "metadata[commercial_plan]": "basic" if expected.plan == "core" else expected.plan,
                    "metadata[interval]": expected.interval,
                    "metadata[billing_interval]": expected.interval,
                    "metadata[kmfx_price_env]": expected.env_name,
                },
            )
    return issues


def feature_enabled(config: dict[str, Any], feature_name: str) -> bool:
    features = config.get("features") or {}
    feature = features.get(feature_name) or {}
    return feature.get("enabled") is True


def subscription_update_products(config: dict[str, Any]) -> list[dict[str, Any]]:
    features = config.get("features") or {}
    subscription_update = features.get("subscription_update") or {}
    products = subscription_update.get("products")
    if isinstance(products, list):
        return [product for product in products if isinstance(product, dict)]
    return []


def audit_customer_portal(product_id: str) -> list[str]:
    issues: list[str] = []
    configs = list_all("/billing_portal/configurations", {"limit": 100})
    active = [config for config in configs if config.get("active")]
    if not active:
        issues.append("customer_portal:no_active_configuration")
        return issues

    required_features = [
        "invoice_history",
        "payment_method_update",
        "subscription_cancel",
        "subscription_update",
    ]
    for feature_name in required_features:
        if not any(feature_enabled(config, feature_name) for config in active):
            issues.append(f"customer_portal:feature_disabled:{feature_name}")

    product_entries: list[dict[str, Any]] = []
    for config in active:
        product_entries.extend(subscription_update_products(config))
    if not product_entries:
        issues.append("customer_portal:subscription_update:no_products_configured")
        return issues

    expected_ids = expected_price_ids()
    kmfx_prices: set[str] = set()
    for product_entry in product_entries:
        entry_product_id = str(product_entry.get("product") or "")
        if entry_product_id != product_id:
            issues.append(f"customer_portal:subscription_update:external_product:{entry_product_id or 'unknown'}")
            continue
        prices = product_entry.get("prices")
        if isinstance(prices, list):
            kmfx_prices.update(str(price_id) for price_id in prices if isinstance(price_id, str))

    if not kmfx_prices:
        issues.append(f"customer_portal:subscription_update:missing_product:{product_id}")
    else:
        for missing_price_id in sorted(expected_ids - kmfx_prices):
            issues.append(f"customer_portal:subscription_update:missing_price:{missing_price_id}")
    return issues


def audit_webhook(endpoint_url: str) -> list[str]:
    issues: list[str] = []
    endpoints = list_all("/webhook_endpoints", {"limit": 100})
    matching = [item for item in endpoints if item.get("url") == endpoint_url and item.get("status") == "enabled"]
    if not matching:
        issues.append(f"webhook_endpoint:missing_or_disabled:{endpoint_url}")
        return issues
    required_events = {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
        "invoice.payment_action_required",
    }
    enabled_events = set(matching[0].get("enabled_events") or [])
    if "*" not in enabled_events:
        missing = sorted(required_events - enabled_events)
        for event_name in missing:
            issues.append(f"webhook_endpoint:missing_event:{event_name}")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit KMFX Stripe production setup.")
    parser.add_argument("--apply-price-metadata", action="store_true", help="Update KMFX Price lookup keys and metadata.")
    parser.add_argument("--product-id", default=env_value("STRIPE_PRODUCT_ID", "KMFX_STRIPE_PRODUCT_ID") or DEFAULT_PRODUCT_ID)
    parser.add_argument("--webhook-url", default=env_value("STRIPE_WEBHOOK_URL", "KMFX_STRIPE_WEBHOOK_URL") or DEFAULT_WEBHOOK_URL)
    args = parser.parse_args()

    issues = []
    issues.extend(audit_product(args.product_id))
    issues.extend(audit_prices(args.product_id, apply=args.apply_price_metadata))
    issues.extend(audit_customer_portal(args.product_id))
    issues.extend(audit_webhook(args.webhook_url))

    result = {
        "ok": not issues,
        "applied_price_metadata": bool(args.apply_price_metadata),
        "product_id": args.product_id,
        "webhook_url": args.webhook_url,
        "issues": issues,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not issues else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2, sort_keys=True), file=sys.stderr)
        raise SystemExit(2)
