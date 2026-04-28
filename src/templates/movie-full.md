---
# Full film template (rich metadata)
# Use in Batch Import or as a manual film note template
# Ratings expected numeric 0..<%= it.rating_scale_max || 10 %>

type: movie
status: to-watch # to-watch | watched | rewatching

title_original: "<%= it.originalTitle || it.title || '' %>"
title_fr: ""
title_en: "<%= it.title || '' %>"

year: <%= it.year || '' %>
franchise: ""
genres: <%= it.genres ? it.genres.yaml() : '[]' %>

countries: <%= it.productionCountries ? it.productionCountries.yaml() : '[]' %>
languages: <%= it.spokenLanguages ? it.spokenLanguages.map(l=>l.iso_639_1).filter(Boolean) : '[]' %>
duration_minutes: <%= it.runtime || '' %>
age_rating: ""
release_date: "<%= it.releaseDate || '' %>"
director: <%= it.directors ? it.directors.map(d=>d.name).yaml() : '[]' %>
writers: []
composer: ""
cinematographer: ""
editor: ""
studio: ""
distributor: ""

cast:
<% if (it.cast && it.cast.length) { %>
<% it.cast.slice(0,20).forEach(c => { %>
  - actor: "<%= c.name %>"
    role: "<%= (c.character || '') %>"
    letterboxd_url: ""
<% }) %>
<% } %>

imdb_id: "<%= it.imdbId || '' %>"
imdb_url: "<% if (it.imdbId) { %>https://www.imdb.com/title/<%= it.imdbId %><% } %>"

omdb_id: ""
omdb_url: ""

tmdb_id: <%= it.tmdbId || '' %>
tmdb_url: "<%= it.tmdbUrl || '' %>"

trailer_url: ""
poster: "<%= it.poster ? it.poster.size('L') : '' %>"

watch_date: ""
watch_count: 0
rewatch: false
where_watched: ""
with: ""
version: ""
mood: ""
favorite: false

rating: 0
rating_story: 0
rating_characters: 0
rating_visuals: 0
rating_soundtrack: 0
rating_emotion: 0

tags: [movie]
Imported-from-TMDB: <%= it.importedFromTMDB ? true : false %>
---

# <%= it.title || it.originalTitle %> (<%= it.year || '' %>)

<% if (it.overview) { %>
<%= it.overview %>
<% } %>
