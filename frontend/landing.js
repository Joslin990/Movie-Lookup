let authMode = 'signup';

const setAuthMode = (mode) => {
    authMode = mode;
    const modal = document.querySelector('.auth-modal');
    const title = modal.querySelector('.auth-title');
    const submitBtn = modal.querySelector('.auth-submit');
    const toggleText = modal.querySelector('.auth-toggle-text');
    const toggleBtn = modal.querySelector('.auth-toggle-btn');

    if (mode === 'signup') {
        title.textContent = 'Sign Up';
        submitBtn.textContent = 'Sign Up';
        toggleText.textContent = 'Already have an account?';
        toggleBtn.textContent = 'Sign In';
    } else {
        title.textContent = 'Sign In';
        submitBtn.textContent = 'Sign In';
        toggleText.textContent = "Don't have an account?";
        toggleBtn.textContent = 'Sign Up';
    }

    hideAuthError();
};

const showAuthError = (message) => {
    const errorEl = document.querySelector('.auth-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
};

const hideAuthError = () => {
    const errorEl = document.querySelector('.auth-error');
    errorEl.classList.add('hidden');
};

const openAuthModal = (mode, prefillEmail) => {
    setAuthMode(mode);
    document.querySelector('.auth-email').value = prefillEmail || '';
    document.querySelector('.auth-password').value = '';
    document.querySelector('.auth-modal').classList.remove('hidden');
};

const closeAuthModal = () => {
    document.querySelector('.auth-modal').classList.add('hidden');
};

const submitAuth = async (email, password) => {
    const { data, error } = authMode === 'signup'
        ? await supabaseClient.auth.signUp({ email, password })
        : await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        throw new Error(error.message);
    }
    return data;
};

const setupAuthTriggers = () => {
    document.querySelectorAll('[data-open-auth]').forEach(el => {
        if (el.tagName === 'FORM') {
            el.addEventListener('submit', (event) => {
                event.preventDefault();
                const emailInput = el.querySelector('input[type="email"]');
                openAuthModal(el.dataset.openAuth, emailInput ? emailInput.value : '');
            });
        } else {
            el.addEventListener('click', (event) => {
                event.preventDefault();
                openAuthModal(el.dataset.openAuth);
            });
        }
    });
};

const setupAuthModal = () => {
    document.querySelector('.close-auth-modal').addEventListener('click', closeAuthModal);
    document.querySelector('.auth-modal').addEventListener('click', (event) => {
        if (event.target.classList.contains('auth-modal')) {
            closeAuthModal();
        }
    });
    document.querySelector('.auth-toggle-btn').addEventListener('click', () => {
        setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
    });

    document.querySelector('.auth-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.querySelector('.auth-email').value.trim();
        const password = document.querySelector('.auth-password').value;
        try {
            const data = await submitAuth(email, password);
            if (!data.session) {
                showAuthError('Check your email to confirm your account, then sign in.');
                return;
            }
            window.location.href = 'index.html';
        } catch (err) {
            showAuthError(err.message);
        }
    });
};

setupAuthTriggers();
setupAuthModal();
