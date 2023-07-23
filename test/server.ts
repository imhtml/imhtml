import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.8.1/mod.ts";

async function compile(path:string){
	const result = await esbuild.build({
		plugins: [...denoPlugins()],
		bundle: true,
		entryPoints: [path],
		outdir: ".",
		write: false,
		format: "esm",
	});
	return result.outputFiles![0].text;
}

async function handler(request: Request) {

	switch (new URL(request.url).pathname){
		case '/':
			return new Response(await Deno.readTextFile("./test/index.html"), {
				headers: { 'content-type': 'text/html' },
			});
		case "/mod.ts": {
			return new Response(await compile("./mod.ts"), {
				headers: { 'content-type': 'text/javascript' },
			});
		}
		default:
			return new Response("Not Found", {
				status: 404,
			});
	}
}

Deno.serve(handler);