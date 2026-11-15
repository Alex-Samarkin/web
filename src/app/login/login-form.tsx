"use client";

import { useActionState } from "react";
import { signInAction } from "./actions";
import type { LoginState } from "./types";

const initialState: LoginState = { error: null };

/**
 * Клиентская форма. Отправка выполняется серверным действием,
 * поэтому пароль не обрабатывается в браузерном коде приложения.
 */
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="stack">
      <div className="field">
        <label className="field__label" htmlFor="email">
          Адрес электронной почты
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="password">
          Пароль
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error && <div className="notice notice--error">{state.error}</div>}

      <button className="btn" type="submit" disabled={isPending}>
        {isPending ? "Выполняется вход…" : "Войти"}
      </button>
    </form>
  );
}