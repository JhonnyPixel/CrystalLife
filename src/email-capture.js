/**
 * Email Capture & Waitlist Module for Shard
 */

const STORAGE_KEY = "shard_waitlist_emails";

const saveEmailLocally = (email) => {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!existing.includes(email)) {
      existing.push(email);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }
  } catch (err) {
    console.warn("Unable to save to localStorage", err);
  }
};

const sendSubscription = async (email) => {
  saveEmailLocally(email);

  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, message: data.message || "You're on the Shard waitlist!" };
    }
  } catch (err) {
    console.log("Cloudflare endpoint unavailable; saved locally.", err);
  }

  return {
    success: true,
    message: "🎉 You're in! You'll be among the first to try Shard when it launches.",
  };
};

export const triggerWaitlistPulse = () => {
  // Jump instantly to top (0ms delay) so Hero showcase is 100% visible
  window.scrollTo(0, 0);

  const heroFormBox = document.querySelector("#waitlist-form") || document.querySelector(".hero-email-capture");
  const emailInput = document.querySelector("[data-email-input]");
  const inputGroup = emailInput?.closest(".email-input-group");

  const targetElements = [heroFormBox, inputGroup, emailInput].filter(Boolean);

  // Reset pulse state
  targetElements.forEach((el) => el.classList.remove("is-pulsing"));

  // Force synchronous reflow to ensure animation restarts reliably
  void document.body.offsetHeight;

  // Apply pulse class
  targetElements.forEach((el) => el.classList.add("is-pulsing"));

  if (emailInput) {
    emailInput.focus();
  }

  // Remove pulse class after 2.4s
  setTimeout(() => {
    targetElements.forEach((el) => el.classList.remove("is-pulsing"));
  }, 2400);
};

export const initializeEmailCapture = () => {
  const forms = document.querySelectorAll("[data-email-form]");
  const ctaButtons = document.querySelectorAll("[data-trigger-waitlist]");

  forms.forEach((form) => {
    const input = form.querySelector("[data-email-input]");
    const status = form.querySelector("[data-email-status]");
    const submitBtn = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = input?.value?.trim();
      if (!email) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("is-loading");
      }

      if (status) {
        status.textContent = "Submitting...";
        status.className = "email-status-msg is-pending";
      }

      const result = await sendSubscription(email);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("is-loading");
      }

      if (result.success) {
        if (input) input.value = "";
        if (status) {
          status.textContent = result.message;
          status.className = "email-status-msg is-success";
        }
      } else {
        if (status) {
          status.textContent = result.message || "Something went wrong. Please try again.";
          status.className = "email-status-msg is-error";
        }
      }
    });
  });

  ctaButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      triggerWaitlistPulse();
    });
  });
};
