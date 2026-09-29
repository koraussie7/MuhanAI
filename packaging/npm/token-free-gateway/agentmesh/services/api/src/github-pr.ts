import { z } from "zod";

const GitHubConfigSchema = z.object({
	token: z.string().min(1),
	repository: z.string().regex(/^[^/]+\/[^/]+$/),
	baseBranch: z.string().min(1).default("main"),
});

export type GitHubPullRequest = {
	html_url: string;
	number: number;
	title: string;
};

function githubConfig() {
	const parsed = GitHubConfigSchema.safeParse({
		token: process.env.GITHUB_TOKEN,
		repository: process.env.GITHUB_REPOSITORY,
		baseBranch: process.env.GITHUB_BASE_BRANCH,
	});
	if (!parsed.success) return null;
	return parsed.data;
}

export function isGitHubPrConfigured(): boolean {
	return githubConfig() !== null;
}

export async function createGitHubPullRequest(input: {
	title: string;
	body: string;
	headBranch: string;
}): Promise<GitHubPullRequest> {
	const config = githubConfig();
	if (!config) throw new Error("GitHub PR integration is not configured");

	const response = await fetch(`https://api.github.com/repos/${config.repository}/pulls`, {
		method: "POST",
		headers: {
			accept: "application/vnd.github+json",
			authorization: `Bearer ${config.token}`,
			"content-type": "application/json",
			"x-github-api-version": "2022-11-28",
		},
		body: JSON.stringify({
			title: input.title,
			body: input.body,
			head: input.headBranch,
			base: config.baseBranch,
		}),
	});

	if (!response.ok) {
		const detail = await response.text();
		throw new Error(`GitHub pull request failed (${response.status}): ${detail.slice(0, 300)}`);
	}
	return (await response.json()) as GitHubPullRequest;
}
