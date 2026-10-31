import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StartupScreen from '../src/StartupScreen.jsx';

afterEach(cleanup);

describe('startup and account entry', () => {
  it('reports initialization work through an accessible progress bar', () => {
    render(<StartupScreen status="loading" completed={2} total={4} />);
    expect(screen.getByRole('progressbar', { name: 'Application setup' }).getAttribute('aria-valuenow')).toBe('2');
    expect(screen.getByRole('status').textContent).toMatch(/entering the realm|summoning the expense dragon|preparing your quest/i);
  });

  it('submits login details and explains an authentication error', async () => {
    const onAuthenticate = vi.fn().mockRejectedValue(new Error('Email or password is incorrect.'));
    render(<StartupScreen status="auth" completed={1} total={2} onAuthenticate={onAuthenticate} />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'adventurer-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /enter the realm/i }));

    await waitFor(() => expect(onAuthenticate).toHaveBeenCalledWith('login', 'player@example.test', 'adventurer-secret'));
    expect((await screen.findByRole('alert')).textContent).toContain('Email or password is incorrect.');
    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
    expect(Boolean(screen.getByRole('button', { name: 'Create account' }))).toBe(true);
  });

  it('offers retry and connection settings when startup cannot reach the API', () => {
    const onRetry = vi.fn();
    const onOpenSettings = vi.fn();
    render(<StartupScreen status="error" error="Backend unavailable." onRetry={onRetry} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
    fireEvent.click(screen.getByRole('button', { name: /connection settings/i }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('Backend unavailable.');
  });
});
