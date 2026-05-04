"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useResendVerification } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";

/**
 * Сторінка "Перевірте email" — показується після успішного register.
 *
 * Шлях: /auth/check-email?email=user@example.com
 *
 * Функціонал:
 *  - Показує адресу на яку надіслано лист
 *  - Кнопка "Resend" (з cooldown після успіху, щоб не спамити)
 *  - Лінк "Повернутись на login"
 *
 * Email береться з query param. Якщо немає — показуємо generic-повідомлення.
 */

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const [resentRecently, setResentRecently] = useState(false);
  const mutation = useResendVerification();

  async function handleResend() {
    if (!email) return;
    try {
      await mutation.mutateAsync({ email });
      toast.success("Лист надіслано. Перевірте поштову скриньку");
      setResentRecently(true);
      // Cooldown 30 секунд — щоб юзер не дозбамлював сервер.
      setTimeout(() => setResentRecently(false), 30_000);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sunset">
        <Mail className="h-6 w-6 text-primary-foreground" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Перевірте email</h1>
        <p className="text-sm text-muted-foreground">
          {email ? (
            <>
              Ми надіслали лист підтвердження на{" "}
              <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            <>Ми надіслали лист підтвердження.</>
          )}{" "}
          Натисніть лінк у листі щоб активувати акаунт.
        </p>
      </div>

      <div className="space-y-3 pt-2">
        {email && (
          <Button
            variant="outline"
            className="w-full"
            disabled={mutation.isPending || resentRecently}
            onClick={handleResend}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {resentRecently ? "Лист щойно надіслано" : "Надіслати лист ще раз"}
          </Button>
        )}

        <Link
          href="/auth/login"
          className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Повернутись до login
        </Link>
      </div>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Не отримали лист? Перевірте папку спам, або переконайтесь що адреса введена правильно.
      </p>
    </div>
  );
}

/**
 * useSearchParams потребує Suspense boundary в App Router.
 * Без нього — error при build.
 */
export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
      <CheckEmailContent />
    </Suspense>
  );
}
