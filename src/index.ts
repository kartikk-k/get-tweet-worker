/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import puppeteer, { Browser, BrowserWorker, ActiveSession } from "@cloudflare/puppeteer";

interface Env {
	MYBROWSER: Fetcher;
	BROWSER_KV_DEMO: KVNamespace;
	SECRET_KEY: string;
}

export interface Tweet {
	__typename: string
	lang: string
	created_at: string
	entities: Entities
	id_str: string
	text: string
	user: User
	mediaDetails?: MediaDetail[]
	photos: Photo[]
	quoted_tweet?: any
}

export interface Entities {
	hashtags: any[]
	urls: any[]
	user_mentions: any[]
	symbols: any[]
	media: Medum[]
}

export interface Medum {
	display_url: string
	expanded_url: string
	indices: number[]
	url: string
}

export interface User {
	id_str: string
	name: string
	profile_image_url_https?: string
	screen_name: string
	verified?: boolean
	is_blue_verified?: boolean
	profile_image_shape?: string
}

export interface EditControl {
	edit_tweet_ids: string[]
	editable_until_msecs: string
	is_edit_eligible: boolean
	edits_remaining: string
}

export interface MediaDetail {
	display_url: string
	expanded_url: string
	ext_media_availability: ExtMediaAvailability
	media_url_https: string // actual url of the media
	type: string // "photo"
	url: string
}

export interface ExtMediaAvailability {
	status: string
}

export interface Photo {
	expandedUrl: string
	url: string
	width: number
	height: number
}


export interface SanitizedTweet {
	__typename: string
	lang: string
	created_at: string
	tweet_id: string

	hastags: string[]
	urls: { displayUrl: string, expandedUrl: string }[]
	user_mentions: { id: string, name: string, username: string }[]

	content: string
	user: User

	photos: string[]
}

export interface ResponseTweet extends SanitizedTweet {
	quote_tweet: SanitizedTweet | null
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method !== 'GET') {
			return new Response("Tweet not found", { status: 404 });
		}
		
		const authToken = request.headers.get('Authorization')?.split(' ')[1];
		if(authToken !== env.SECRET_KEY){
			return new Response("Unauthorized", { status: 401 });
		}
		
		const { searchParams } = new URL(request.url);
		let id = searchParams.get("id");

		if (!id) return new Response("No id provided", { status: 400 });

		let tweetInfo: ResponseTweet | null = null;

		// Pick random session from open sessions
		let sessionId = await getRandomSession(env.MYBROWSER);
		let browser, launched;
		if (sessionId) {
			try {
				browser = await puppeteer.connect(env.MYBROWSER, sessionId);
			} catch (e) {
				// another worker may have connected first
				console.log(`Failed to connect to ${sessionId}. Error ${e}`);
			}
		}
		if (!browser) {
			// No open sessions, launch new session
			browser = await puppeteer.launch(env.MYBROWSER, { keep_alive: 10000 });
			launched = true;
		}

		sessionId = browser.sessionId(); // get current session id

		console.log("Creating page");
		const page = await browser.newPage();
		console.log("Navigating to tweet");
		await page.goto(`https://tweet-fetcher-client.pages.dev?id=${id}`);
		// await page.goto(`http://localhost:3000/?id=${id}`);


		console.log("Evaluating tweet body");
		const innerText = await page.$eval('body', (el) => {
			return el.innerText;
		})

		try {
			if (innerText === 'error') throw new Error('Tweet not found')

			const tweet = JSON.parse(innerText) as Tweet;

			let quote_tweet: SanitizedTweet | null = null;

			// if the tweet is a quote tweet, sanitize the quote tweet
			if (tweet.quoted_tweet) {
				quote_tweet = {
					__typename: tweet.quoted_tweet.__typename,
					lang: tweet.quoted_tweet.lang,
					created_at: tweet.quoted_tweet.created_at,
					tweet_id: tweet.quoted_tweet.id_str,
					hastags: tweet.quoted_tweet.entities.hashtags?.map((v: any) => v.text) || [],
					urls: tweet.quoted_tweet.entities.urls?.map((v: any) => ({ displayUrl: v.display_url, expandedUrl: v.expanded_url })) || [],
					user_mentions: tweet.quoted_tweet.entities.user_mentions?.map((v: any) => ({ id: v.id_str, name: v.name, username: v.screen_name })) || [],
					content: tweet.quoted_tweet.text,
					user: tweet.quoted_tweet.user,
					photos: tweet.quoted_tweet.photos?.map((v: any) => v.url) || [],
				}
			}

			// sanitize the tweet
			tweetInfo = {
				__typename: tweet.__typename,
				lang: tweet.lang,
				created_at: tweet.created_at,
				tweet_id: tweet.id_str,
				hastags: tweet.entities.hashtags?.map((v) => v.text) || [],
				urls: tweet.entities.urls?.map((v) => ({ displayUrl: v.display_url, expandedUrl: v.expanded_url })) || [],
				user_mentions: tweet.entities.user_mentions?.map((v) => ({ id: v.id_str, name: v.name, username: v.screen_name })) || [],
				content: tweet.text,
				user: tweet.user,
				photos: tweet.photos?.map((v) => v.url) || [],
				quote_tweet: quote_tweet 
			}

		} catch (e) {
			console.log("Error", e);
			return Response.json({
				error: 'Tweet not found',
			}, { status: 404 });
		}

		console.log("Closing browser");
		browser.disconnect();

		// key value store for caching
		// await env.BROWSER_KV_DEMO.put(id, html, {
		// 	expirationTtl: 60 * 60 * 24,
		// });

		return Response.json({
			data: tweetInfo,
		});

	},
} satisfies ExportedHandler<Env>;


async function getRandomSession(endpoint: BrowserWorker): Promise<string | undefined> {
	const sessions: ActiveSession[] = await puppeteer.sessions(endpoint);
	console.log(`Sessions: ${JSON.stringify(sessions)}`);
	const sessionsIds = sessions
		.filter((v) => {
			return !v.connectionId; // remove sessions with workers connected to them
		})
		.map((v) => {
			return v.sessionId;
		});
	if (sessionsIds.length === 0) {
		return;
	}

	const sessionId =
		sessionsIds[Math.floor(Math.random() * sessionsIds.length)];

	return sessionId!;
}