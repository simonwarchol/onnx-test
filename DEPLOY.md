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
   **`https://<your-username>.github.io/<repo-name>/`**  
   (e.g. `https://octocat.github.io/onnx-test/`).

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
