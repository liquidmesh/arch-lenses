# GitHub Authentication Setup

GitHub no longer supports password authentication. You need to use one of these methods:

## Option 1: SSH Keys (Recommended - Easiest)

SSH keys are the easiest and most secure way to authenticate with GitHub.

### Step 1: Check if you already have SSH keys

```bash
ls -la ~/.ssh
```

If you see `id_rsa` and `id_rsa.pub` (or `id_ed25519` and `id_ed25519.pub`), you already have SSH keys. Skip to Step 3.

### Step 2: Generate SSH Key (if needed)

```bash
# Generate a new SSH key (replace with your GitHub email)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Press Enter to accept default file location
# Optionally set a passphrase (recommended for security)
```

### Step 3: Add SSH Key to SSH Agent

```bash
# Start the ssh-agent
eval "$(ssh-agent -s)"

# Add your SSH key
ssh-add ~/.ssh/id_ed25519
# Or if you used the default RSA:
# ssh-add ~/.ssh/id_rsa
```

### Step 4: Add SSH Key to GitHub

1. **Copy your public key:**
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Or for RSA:
   # cat ~/.ssh/id_rsa.pub
   ```

2. **Add to GitHub:**
   - Go to https://github.com/settings/keys
   - Click **"New SSH key"**
   - Title: `My Mac` (or any name)
   - Key: Paste the entire output from the `cat` command
   - Click **"Add SSH key"**

### Step 5: Test SSH Connection

```bash
ssh -T git@github.com
```

You should see: `Hi liquidmesh! You've successfully authenticated...`

### Step 6: Use SSH URL for Repository

```bash
cd "/Users/neb/arch lenses/arch-lenses"
git remote add origin git@github.com:liquidmesh/arch-lenses.git
```

---

## Option 2: Personal Access Token (PAT)

If you prefer HTTPS, you can use a Personal Access Token.

### Step 1: Create Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Name: `Arch Lenses Deployment`
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click **"Generate token"**
6. **Copy the token immediately** (you won't see it again!)

### Step 2: Use Token for Authentication

When pushing, use your token as the password:

```bash
git remote add origin https://github.com/liquidmesh/arch-lenses.git
git push -u origin main
# Username: liquidmesh
# Password: paste_your_token_here
```

Or store credentials (macOS):
```bash
git config --global credential.helper osxkeychain
```

---

## Option 3: GitHub CLI (Alternative)

Install GitHub CLI and authenticate:

```bash
# Install (macOS)
brew install gh

# Authenticate
gh auth login

# Then use regular git commands
```

---

## Quick Fix for Your Current Setup

Since your username is `liquidmesh`, run these commands:

### Using SSH (if you set up SSH keys):

```bash
cd "/Users/neb/arch lenses/arch-lenses"
git remote remove origin
git remote add origin git@github.com:liquidmesh/arch-lenses.git
git push -u origin main
```

### Using HTTPS with Personal Access Token:

```bash
cd "/Users/neb/arch lenses/arch-lenses"
git remote remove origin
git remote add origin https://github.com/liquidmesh/arch-lenses.git
git push -u origin main
# When prompted for password, paste your Personal Access Token
```

---

## Recommendation

**Use SSH keys** - they're:
- ✅ More secure
- ✅ No need to enter passwords
- ✅ Works automatically after setup
- ✅ One-time setup

