"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loginSchema, type LoginDto } from "@chat/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { getErrorCode, getErrorMessage } from "@/lib/api/errors";

/**
 * Login form. RHF + zodResolver використовує ту саму loginSchema що й бекенд.
 *
 * Помилки:
 * - валідація — inline під полями (від zodResolver)
 * - сервер 401/403 — toast + перебудова повідомлення через getErrorMessage
 * - EMAIL_NOT_VERIFIED — окрема логіка з лінком "Resend"
 */
export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const mutation = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginDto) {
    try {
      await mutation.mutateAsync(values);
      router.push("/");
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "EMAIL_NOT_VERIFIED") {
        // Зберігаємо email у state, показуємо UI з кнопкою resend
        setUnverifiedEmail(values.email);
      } else {
        toast.error(getErrorMessage(err));
      }
    }
  }

  // Спецстан — юзер з невіріфікованим email
  if (unverifiedEmail) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-8 backdrop-blur-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Email не підтверджено</h1>
        <p className="text-sm text-muted-foreground">
          Ми надіслали лист підтвердження на <span className="font-medium text-foreground">{unverifiedEmail}</span>.
          Перевірте поштову скриньку (включно зі спамом) і натисніть лінк у листі.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href={`/auth/check-email?email=${encodeURIComponent(unverifiedEmail)}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Не отримали лист? Надіслати ще раз
          </Link>
          <button
            type="button"
            onClick={() => setUnverifiedEmail(null)}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Повернутись до login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card/60 p-8 backdrop-blur-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Вхід</h1>
        <p className="text-sm text-muted-foreground">Ласкаво просимо назад</p>
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
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Пароль</Label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Забули пароль?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              disabled={mutation.isPending}
              aria-invalid={!!errors.password}
              className="pr-10"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="sunset"
          size="lg"
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Увійти
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        Ще не маєте акаунту?{" "}
        <Link href="/auth/register" className="text-foreground underline-offset-4 hover:underline">
          Зареєструватись
        </Link>
      </div>
    </div>
  );
}
