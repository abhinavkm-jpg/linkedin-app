"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Circle, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveIntegrationSettings, testUnipile } from "@/app/(dashboard)/settings/actions";
import type { SettingsStatus } from "@/lib/settings";

export function IntegrationsForm({ status }: { status: SettingsStatus }) {
  const [pending, start] = useTransition();
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({
    unipileDsn: status.unipileDsn ?? "",
    unipileApiKey: "",
    unipileWebhookSecret: "",
    anthropicApiKey: "",
    qstashToken: "",
    qstashCurrentSigningKey: "",
    qstashNextSigningKey: "",
  });

  function set(key: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [key]: v }));
  }

  function save() {
    start(async () => {
      // Only send non-empty fields; blanks keep existing values.
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v.trim() !== ""),
      );
      await saveIntegrationSettings(payload);
      toast.success("Settings saved");
      setForm((f) => ({
        ...f,
        unipileApiKey: "",
        unipileWebhookSecret: "",
        anthropicApiKey: "",
        qstashToken: "",
        qstashCurrentSigningKey: "",
        qstashNextSigningKey: "",
      }));
    });
  }

  function test() {
    setTesting(true);
    testUnipile()
      .then((r) => (r.ok ? toast.success(r.message) : toast.error(r.message)))
      .finally(() => setTesting(false));
  }

  return (
    <div className="space-y-5">
      <Section title="Unipile" configured={status.unipileApiKey && !!status.unipileDsn}>
        <Field label="DSN (workspace base URL, incl. port)">
          <Input
            value={form.unipileDsn}
            onChange={(e) => set("unipileDsn", e.target.value)}
            placeholder="https://apiXX.unipile.com:XXXXX"
          />
        </Field>
        <SecretField
          label="API key"
          configured={status.unipileApiKey}
          value={form.unipileApiKey}
          onChange={(v) => set("unipileApiKey", v)}
        />
        <SecretField
          label="Webhook secret (any random string you choose)"
          configured={status.unipileWebhookSecret}
          value={form.unipileWebhookSecret}
          onChange={(v) => set("unipileWebhookSecret", v)}
        />
      </Section>

      <Section title="Anthropic (Claude)" configured={status.anthropicApiKey}>
        <SecretField
          label="API key"
          configured={status.anthropicApiKey}
          value={form.anthropicApiKey}
          onChange={(v) => set("anthropicApiKey", v)}
        />
      </Section>

      <Section title="Upstash QStash" configured={status.qstashToken}>
        <SecretField
          label="Token"
          configured={status.qstashToken}
          value={form.qstashToken}
          onChange={(v) => set("qstashToken", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SecretField
            label="Current signing key"
            configured={status.qstashSigningKeys}
            value={form.qstashCurrentSigningKey}
            onChange={(v) => set("qstashCurrentSigningKey", v)}
          />
          <SecretField
            label="Next signing key"
            configured={status.qstashSigningKeys}
            value={form.qstashNextSigningKey}
            onChange={(v) => set("qstashNextSigningKey", v)}
          />
        </div>
      </Section>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save settings
        </Button>
        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Test Unipile
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  configured,
  children,
}: {
  title: string;
  configured: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        {configured ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {configured ? "configured" : "not configured"}
        </span>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SecretField({
  label,
  configured,
  value,
  onChange,
}: {
  label: string;
  configured: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={configured ? "•••••••• (leave blank to keep)" : "Not set"}
        autoComplete="off"
      />
    </Field>
  );
}
