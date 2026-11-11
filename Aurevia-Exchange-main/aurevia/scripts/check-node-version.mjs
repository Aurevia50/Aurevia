const [major,minor]=process.versions.node.split('.').map(Number);
if(major!==22||minor<19){
	console.error(`Aurevia requires Node.js >=22.19 and <23; found ${process.versions.node}.`);
	process.exit(1);
}
console.log(`Node.js ${process.versions.node}`);
