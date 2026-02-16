# Deploying to GitHub Pages

This project is set up to build and deploy to GitHub Pages via GitHub Actions.

## One-time setup (from the GitHub website)

1. **Push the repo to GitHub**  
   If you haven’t already, create a repository on GitHub and push this project (including the `.github/workflows/deploy.yml` file).

2. **Enable GitHub Pages and set the source**  
   - Open your repo on GitHub.  
   - Go to **Settings** → **Pages** (in the left sidebar under “Code and automation”).  
   - Under **Build and deployment**:  
     - **Source**: choose **GitHub Actions**.

3. **Trigger a deploy**  
   - Either push a commit to the `main` branch, or  
   - Go to **Actions** → select the “Deploy to GitHub Pages” workflow → **Run workflow** (and run it).

4. **See your site**  
   After the workflow finishes (a minute or two), your site will be at:  
   **`https://<your-username>.github.io/<repo-name>/`**.

### Deploy to a user site at `simonwarchol.com/onnx-test/`

If your main site is at **simonwarchol.com** (from a user/org Pages repo) and you want this app at **simonwarchol.com/onnx-test/**:

1. In **this** repo (onnx-test): go to **Settings** → **Secrets and variables** → **Actions**.
2. Add two repository secrets:
   - **`DEPLOY_TARGET_REPO`** – the repo that serves simonwarchol.com (e.g. `simonwarchol/simonwarchol.github.io`).
   - **`GH_PAT`** – a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope so the workflow can push to that repo.
3. Push a commit or re-run the workflow. A second job will copy the built app into the `onnx-test/` folder of the target repo and push. The next time that repo’s site builds, **https://simonwarchol.com/onnx-test/** will serve this app.

## Local build that matches GitHub Pages

To test the same base path as production:

```bash
VITE_BASE_PATH=/onnx-test/ npm run build
npm run preview
```

Then open the URL shown (e.g. `http://localhost:4173/onnx-test/`).

## If you rename the repository

The workflow uses the repo name for the base path, so after a rename the site URL becomes  
`https://<username>.github.io/<new-repo-name>/`.  
No code changes are required; push a new commit to trigger a fresh deploy.
