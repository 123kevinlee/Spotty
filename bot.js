const SpotifyWebApi = require('spotify-web-api-node');
const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const { google } = require('googleapis');
const youtubeV3 = google.youtube({ version: 'v3', auth: 'keyhere' });

const prefix = '+';
const token = 'tokenhere';

const client = new Discord.Client();

const queue = new Map();

client.once("ready", () => {
    console.log("Ready!");
});

client.once("reconnecting", () => {
    console.log("Reconnecting!");
});

client.once("disconnect", () => {
    console.log("Disconnect!");
});

client.on("message", async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const serverQueue = queue.get(message.guild.id);

    if (message.content.startsWith(`${prefix}play`)) {
        execute(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}skip`)) {
        skip(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}stop`)) {
        stop(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}queue`)) {
        var string = 'Queue\n';
        var counter = 1;
        for (var song of serverQueue.songs) {
            string += counter + '. ' + song['title'] + '\n';
            counter++;
        }
        message.channel.send(string);
        return;
    } else {
        message.channel.send("You need to enter a valid command!");
    }
});

async function execute(message, serverQueue) {
    const args = message.content.split(" ");
    //console.log(message);

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
        return message.channel.send(
            "You need to be in a voice channel to play music!"
        );
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel!"
        );
    }

    if (args[1].indexOf('spotify') > 0) {
        var spotifyApi = new SpotifyWebApi({
            clientId: 'clientId',
            clientSecret: ' clientSecret'
        });

        spotifyApi.clientCredentialsGrant()
            .then(async function (data) {
                spotifyApi.setAccessToken(data.body['access_token']);

                spotifyApi.getPlaylistTracks(args[1].substring(args[1].lastIndexOf('/') + 1, args[1].indexOf('?'))).then(
                    async function (data) {
                        var counter = 0;
                        for (var item of data.body['items']) {
                            var songName = item['track']['name'];
                            var artists = '';
                            for (var j = 0; j < item['track']['artists'].length; j++) {
                                artists += item['track']['artists'][j]['name'] + ' ';
                            }
                            //console.log(songName + ' ' + artists);
                            await searchSong(songName + ' ' + artists, counter, message);
                            counter++;
                        }
                    },
                    function (err) {
                        console.error(err);
                    }
                )
            }, function (err) {
                console.log('Something went wrong when retrieving an access token', err.message);
            });
    }

    else {
        const songInfo = await ytdl.getInfo(args[1]);
        const song = {
            title: songInfo.videoDetails.title,
            url: songInfo.videoDetails.video_url
        };

        if (!serverQueue) {
            const queueContruct = {
                textChannel: message.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            };

            queue.set(message.guild.id, queueContruct);

            queueContruct.songs.push(song);

            try {
                var connection = await voiceChannel.join();
                queueContruct.connection = connection;
                play(message.guild, queueContruct.songs[0]);
            } catch (err) {
                console.log(err);
                queue.delete(message.guild.id);
                return message.channel.send(err);
            }
        } else {
            serverQueue.songs.push(song);
            return message.channel.send(`${song.title} has been added to the queue!`);
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function searchSong(query, counter, message) {
    await youtubeV3.search.list({
        part: 'snippet',
        type: 'video',
        q: query,
        maxResults: 5,
        order: 'relevance',
        safeSearch: 'moderate',
        videoEmbeddable: true
    }, async (err, response) => {
        //console.log('https://www.youtube.com/watch?v=' + response['data']['items'][0]['id']['videoId']);
        if (counter == 0) {
            await spotifyStart('https://www.youtube.com/watch?v=' + response['data']['items'][0]['id']['videoId'], message);
            console.log(queue.get(message.guild.id).songs)
            console.log('started playlist');
        }
        else {
            await sleep(5000);
            await spotifyQueue('https://www.youtube.com/watch?v=' + response['data']['items'][0]['id']['videoId'], queue.get(message.guild.id));
            console.log('added song');
        }
    });
}

async function spotifyStart(url, message) {
    //const args = message.content.split(" ");

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
        return message.channel.send(
            "You need to be in a voice channel to play music!"
        );
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel!"
        );
    }

    const songInfo = await ytdl.getInfo(url);
    const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url
    };


    const queueContruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true
    };

    queue.set(message.guild.id, queueContruct);
    queueContruct.songs.push(song);

    try {
        var connection = await voiceChannel.join();
        queueContruct.connection = connection;
        play(message.guild, queueContruct.songs[0]);
        serverQueue.textChannel.send(`Started Playing: **${song.title}**`);
    } catch (err) {
        console.log(err);
        queue.delete(message.guild.id);
        return message.channel.send(err);
    }
}

async function spotifyQueue(url, serverQueue) {
    const songInfo = await ytdl.getInfo(url);
    const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url
    };
    serverQueue.songs.push(song);
    //serverQueue.textChannel.send(`Queued: **${song.title}**`);
}

function skip(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music!"
        );
    if (!serverQueue)
        return message.channel.send("There is no song that I could skip!");
    serverQueue.connection.dispatcher.end();
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music!"
        );
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on("finish", () => {
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    //serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

client.login(token);
