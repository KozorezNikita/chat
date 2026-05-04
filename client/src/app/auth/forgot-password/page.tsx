"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { requestPasswordResetSchema, type RequestPasswordResetDto } from "@chat/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequestPasswordReset } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";

/**
 * /auth/forgot-password
 *
 * Форма з одним полем (email) → POST /request-password-reset.
 *
 * Узгоджено: B-варіант (не leak існування) — після успіху завжди показуємо
 * "Якщо акаунт існує — лист надіслано". Юзер не дізнається чи email був
 * у БД чи ні.
 */
export default function ForgotPasswordPage() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const mutation = useRequestPasswordReset();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestPasswordResetDto>({
    resolver: zodResolver(requestPasswordResetSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });

  async function onSubmit(values: RequestPasswordResetDto) {
    try {
      await mutation.mutateAsync(values);
      setSubmittedEmail(values.email);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  // Success state — після надсилання
  if (submittedEmail) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sunset">
          <Mail className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Перевірте email</h1>
        <p className="text-sm text-muted-foreground">
          Якщо акаунт із адресою <span className="font-medium text-foreground">{submittedEmail}</span> існує,
          ми надіслали лінк для скидання пароля. Перевірте поштову скриньку (включно зі спамом).
        </p>
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          Не отримали лист протягом 5 хвилин? Спробуйте ще раз з іншою адресою.
        </p>
        <Link
          href="/auth/login"
          className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Повернутись до login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card/60 p-8 backdrop-blur-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Забули пароль?</h1>
        <p className="text-sm text-muted-foreground">
          Введіть email — ми надішлемо лінк для створення нового пароля
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled={mutation.isPending}
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <Button
          type="submit"
          variant="sunset"
          size="lg"
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Надіслати лінк
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="text-foreground underline-offset-4 hover:underline">
          ← Повернутись до login
        </Link>
      </div>
    </div>
  );
}
