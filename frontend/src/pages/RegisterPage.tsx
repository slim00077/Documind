import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/auth.api";

const emailRegex =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const validate = (): string | null => {
    if (!name.trim()) {
      return "Please enter your name.";
    }

    if (!emailRegex.test(email.trim())) {
      return "Please enter a valid email address.";
    }

    if (password.length < 8) {
      return "Password must be at least 8 characters.";
    }

    return null;
  };

  const onSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError("");

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      navigate("/app", { replace: true });
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError(
          "Unable to create your account right now. Please try again."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <p className="auth-eyebrow">DocuMind</p>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-hint">
          Start organizing and understanding your documents with AI.
        </p>

        <label className="auth-label" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          className="auth-input"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) =>
            setName(event.target.value)
          }
          disabled={isSubmitting}
          required
        />

        <label className="auth-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="auth-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          disabled={isSubmitting}
          required
        />

        <label className="auth-label" htmlFor="password">
          Password
        </label>
        <div className="password-input-row">
          <input
            id="password"
            className="auth-input"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            disabled={isSubmitting}
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() =>
              setShowPassword(
                (previous) => !previous
              )
            }
            disabled={isSubmitting}
            aria-label={
              showPassword
                ? "Hide password"
                : "Show password"
            }
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="auth-submit"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Creating account..."
            : "Create account"}
        </button>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
