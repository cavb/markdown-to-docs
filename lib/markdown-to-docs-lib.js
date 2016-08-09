(function () {

    var fileToProcess = false;

    var chalk = require('chalk');
    var program = require('commander');
    var Q = require('q');
    var filepath = require('filepath');
    var markdownpdf = require("markdown-pdf");
    var through = require('through');
    var cheerio = require('cheerio');
    var markdown = require("markdown").markdown;
    var fs = require('fs');

    require('pkginfo')(module, 'version');

    exports.run = function () {

        program
                .version(module.exports.version)
                .usage('[options] <markdownFile>')
                .option('-p, --pdf <value>', 'PDF output path', false)
                .option('-w, --html <value>', 'HTML output path', false)
                .option('-v, --verbose', 'Be verbose and log all steps to console', false)
                .option('-f, --fit', 'Fit images (PDF only)', false)
                .action(function (markdownFile) {
                    fileToProcess = markdownFile;
                })
                .parse(process.argv);


        //----------------------------------------------------------------------

        program.fileToProcess = fileToProcess;
        program.version = module.exports.version;

        //----------------------------------------------------------------------

        var processPdfHtml = function (program, data) {

            var $ = cheerio.load(data);

            $('img[src]').each(function (i, elem) {
                var path = $(this).attr('src');
                var processedPath = getProcessedPath(path);

                if (processedPath !== false) {

                    var fixedUrl = "file:///" + processedPath;
                    if (program.verbose) {
                        console.log(chalk.yellow("Fixed URL: ") + chalk.white(fixedUrl))
                    }

                    $(this).attr('src', fixedUrl);

                    if (program.fit) {
                        $(this).attr('width', "100%");
                    }
                }
            });

            return $.html();
        }

        //----------------------------------------------------------------------

        var getProcessedPath = function (path) {

            if ((path.substr(0, 7) === "http://") || (path.substr(0, 8) === "https://")) {
                return false;
            }

            var pathObj = imgBasePath.resolve(path);
            var svgObj = pathObj.dir().append(pathObj.basename(pathObj.extname()) + ".svg");

            if (svgObj.exists()) {
                pathObj = svgObj;
            }

            if (pathObj.exists()) {
                return pathObj.toString();
            }

            return false;
        }

        //----------------------------------------------------------------------

        var processHtml = function (program, data) {

            var $ = cheerio.load(data);

            $('img[src]').each(function (i, elem) {
                var path = $(this).attr('src');
                var processedPath = getProcessedPath(path);

                if (processedPath !== false) {

                    var detectedMime = false;
                    var knownMimes = {
                        ".svg": "image/svg+xml",
                        ".png": "image/png",
                        ".jpg": "image/jpeg",
                        ".gif": "image/gif",
                        ".svgz": "image/svg+xml",
                        ".jpeg": "image/jpeg"
                    };

                    var ext = processedPath.substr(processedPath.length - 5);
                    if (typeof knownMimes[ext] !== "undefined") {
                        detectedMime = knownMimes[ext];
                    }

                    ext = processedPath.substr(processedPath.length - 4);
                    if (typeof knownMimes[ext] !== "undefined") {
                        detectedMime = knownMimes[ext];
                    }

                    if (detectedMime !== false) {
                        var fileCnt = fs.readFileSync(processedPath);
                        var fixedUrl = "data:" + detectedMime + ";base64," + new Buffer(fileCnt).toString('base64');

                        $(this).attr('src', fixedUrl);

                        if (program.verbose) {
                            console.log(chalk.yellow("Embeded file: ") + chalk.white(processedPath))
                        }
                    }
                }
            });

            return $.html();
        };

        //----------------------------------------------------------------------

        if (!program.fileToProcess) {

            console.log(chalk.underline.yellow("Please specify MARKDOWN file to process"));
            program.outputHelp();
            process.exit();

        } else {

            var file = filepath.create(program.fileToProcess);

            if (!file.exists()) {
                console.log(chalk.yellow("Specified input MARKDOWN file does not exists! ") + chalk.white(program.fileToProcess));
                process.exit();
            }

            if (program.verbose) {
                console.log(chalk.underline.yellow("Processing file: ") + chalk.white(program.fileToProcess));
            }

            var imgBasePath = file.dir();
            var preProcessHtml = function () {
                return through(function (data) {
                    this.queue(processPdfHtml(program, data));
                });
            };

            if (program.pdf) {
                markdownpdf({preProcessHtml: preProcessHtml})
                        .from(program.fileToProcess)
                        .to(program.pdf, function () {
                            if (program.verbose) {
                                console.log(chalk.green("Created PDF: ") + chalk.white(program.pdf))
                            }
                        });
            }

            if (program.html) {
                var source = filepath.create(program.fileToProcess);
                source
                        .read()
                        .then(function (rawMarkdown) {

                            var syncPath = filepath.create(program.html);
                            var html = processHtml(program, markdown.toHTML(rawMarkdown));
                            syncPath.write(html, {sync: true});
                            if (program.verbose) {
                                console.log(chalk.green("Created HTML: ") + chalk.white(program.html))
                            }

                        });

            }

        }
    }



}).call(this);