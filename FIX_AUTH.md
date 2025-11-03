# Quick Fix: Authentication Error

## The Problem

GitHub no longer accepts passwords. You're seeing:
```
Invalid username or token. Password authentication is not supported.
```

## Quick Solution (Choose One)

### ✅ Option 1: SSH Keys (Recommended - 5 minutes)

1. **Generate SSH key** (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Press Enter 3 times (or set a passphrase)
   ```

2. **Start SSH agent and add key**:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```

3. **Copy your public key**:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Copy the entire output
   ```

4. **Add to GitHub**:
   - Go to https://github.com/settings/keys
   - Click **"New SSH key"**
   - Paste the copied key
   - Click **"Add SSH key"**

5. **Test it**:
   ```bash
   ssh -T git@github.com
   # Should say: "Hi liquidmesh! You've successfully authenticated..."
   ```

6. **Use SSH URL**:
   ```bash
   cd "/Users/neb/arch lenses/arch-lenses"
   git remote add origin git@github.com:liquidmesh/arch-lenses.git
   git push -u origin main
   ```

---

### ✅ Option 2: Personal Access Token (Quick)

1. **Create token**:
   - Go to https://github.com/settings/tokens
   - Click **"Generate new token (classic)"**
   - Name: `Arch Lenses`
   - Check `repo` and `workflow` scopes
   - Click **"Generate token"**
   - **Copy the token** (you won't see it again!)

2. **Use HTTPS URL**:
   ```bash
   cd "/Users/neb/arch lenses/arch-lenses"
   git remote add origin https://github.com/liquidmesh/arch-lenses.git
   git push -u origin main
   # Username: liquidmesh
   # Password: paste_your_token_here
   ```

3. **Save credentials** (so you don't have to enter it every time):
   ```bash
   git config --global credential.helper osxkeychain
   ```

---

## Which Should You Use?

- **SSH**: Better for long-term use, no passwords needed, more secure
- **PAT**: Quicker setup, works immediately, need to enter token once

Both work great! Choose what's easier for you.

---

## Need More Details?

See [GITHUB_AUTH.md](./GITHUB_AUTH.md) for complete instructions.

