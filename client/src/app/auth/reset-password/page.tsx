"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { resetPasswordSchema } from "@chat/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResetPassword } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";

/**
 * /auth/reset-password?token=XXX
 *
 * Сторінка для встановлення нового пароля. Token береться з query.
 *
 * Форма має 2 поля: password + confirmPassword. Бекенд приймає лише
 * { token, password } — confirm перевіряється тільки на фронті
 * (через .refine на formSchema).
 *
 * На успіх → toast + redirect на /auth/login.
 */

// Розширюємо shared-схему confirm-полем (це fronend-only валідація)
const formSchema = resetPasswordSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Паролі не співпадають",
  });

type FormValues = z.infer<typeof formSchema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [showPassword, setShowPassword] = useState(false);
  const mutation = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: { token: token ?? "", password: "", confirmPassword: "" },
  });

  // No token → invalid link state
  if (!token) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <XCircle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Невалідне посилання</h1>
        <p className="text-sm text-muted-foreground">У посиланні бракує токена скидання пароля.</p>
        <Link
          href="/auth/forgot-password"
          className="inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          Запросити нове посилання
        </Link>
      </div>
    );
  }

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({ token: values.token, password: values.password });
      toast.success("Пароль успішно змінено. Увійдіть з новим паролем");
      router.push("/auth/login");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card/60 p-8 backdrop-blur-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Новий пароль</h1>
        <p className="text-sm text-muted-foreground">Створіть надійний пароль для вашого акаунту</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input type="hidden" {...register("token")} />

        <div className="space-y-2">
          <Label htmlFor="password">Новий пароль</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Мінімум 8 символів, літери та цифри"
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
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Повторіть пароль</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            disabled={mutation.isPending}
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
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
          Змінити пароль
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
