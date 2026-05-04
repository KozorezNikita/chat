"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useVerifyEmail } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";

/**
 * /auth/verify?token=XXX
 *
 * Сторінка яку відкриває юзер з email-листа. Одразу шле POST /verify-email.
 *
 * Три стани UI:
 *  - loading: показуємо спінер "Підтверджуємо email..."
 *  - success: зелений check + кнопка "Перейти до login"
 *  - error: червоний x + кнопка "Зареєструватись знову"
 */

type Status = "loading" | "success" | "error" | "no-token";

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const mutation = useVerifyEmail();
  const [status, setStatus] = useState<Status>(token ? "loading" : "no-token");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // useRef-guard щоб не зашле POST двічі у React StrictMode (dev).
  // Без нього у dev-режимі useEffect run-иться двічі, перший verify
  // успіх, другий → INVALID_TOKEN (бо токен вже used). Юзер бачить error
  // замість success — обидві відповіді приходять, з останньої формуємо UI.
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!token || hasFiredRef.current) return;
    hasFiredRef.current = true;

    mutation
      .mutateAsync({ token })
      .then(() => setStatus("success"))
      .catch((err) => {
        setErrorMsg(getErrorMessage(err));
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "no-token") {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <XCircle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Невалідне посилання</h1>
        <p className="text-sm text-muted-foreground">У посиланні бракує токена підтвердження.</p>
        <Link href="/auth/login" className="inline-block text-sm text-primary underline-offset-4 hover:underline">
          ← Перейти до login
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Підтверджуємо email...</h1>
        <p className="text-sm text-muted-foreground">Це триватиме кілька секунд.</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Email підтверджено!</h1>
        <p className="text-sm text-muted-foreground">Ваш акаунт активовано. Тепер можете увійти.</p>
        <div className="pt-2">
          <Button asChild variant="sunset" size="lg" className="w-full">
            <Link href="/auth/login">Перейти до login</Link>
          </Button>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <XCircle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Не вдалося підтвердити</h1>
      <p className="text-sm text-muted-foreground">{errorMsg || "Посилання недійсне або застаріло."}</p>
      <div className="space-y-2 pt-2">
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/register">Зареєструватись знову</Link>
        </Button>
        <Link
          href="/auth/login"
          className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Повернутись до login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
