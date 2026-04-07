Artifactory Archive Old Artifacts User Worker
This worker is used to archive artifacts from a given source repository in Artifactory to a given destination repository. The artifacts are chosen based on a mixture of available parameters.

Note that this worker will delete your artifacts. The archive process is designed to preserve the name, path, and properties of an artifact, but save disk space by deleting the file contents. This worker is to be used for build artifacts that are no longer needed, when it's still useful to keep the build around for auditing or history purposes.


Features
Re-deploys artifacts that are to be archived, to save disk space.
Archived artifacts are moved to an archive repository, to be separate from non-archived artifacts.
Archived artifacts retain all properties that were set, and are also tagged with the archival timestamp.
Input Parameters
filePattern - the file pattern to match against in the source repository
srcRepo - the source repository to scan for artifacts to be archived
archiveRepo - the repository where matching artifacts are archived to
archiveProperty - the name of the property to use when tagging the archived artifact with the archive timestamp
Available 'time period' archive policies:
lastModified - the last time the artifact was modified
lastUpdated - the last time the artifact was updated
created - the creation date of the artifact
lastDownloaded - the last time the artifact was downloaded
age - the age of the artifact
NOTE: the time period archive policies are all specified in number of days

Available 'property' archive policies:
includePropertySet - the artifact will be archived if it possesses all of the passed in properties
excludePropertySet - the artifact will not be archived if it possesses all of the passed in properties
NOTE: property set format ⇒ prop[:value1[;prop2[:value2]......[;propN[:valueN]]])

A property key must be provided, but a corresponding value is not necessary. If a property is set without a value, then a check is made for just the key.

Available artifact keep policy:
numKeepArtifacts - the number of artifacts to keep per directory
NOTE: This allows one to keep X number of artifacts (based on natural directory sort per directory). So, if your artifacts are laid out in a flat directory structure, you can keep the last X artifacts in each directory with this setting.

One can set any number of 'time period' archive policies as well as any number of include and exclude attribute sets. It is up to the caller to decide how best to archive artifacts. If no archive policy parameters are sent in, the plugin aborts in order to not allow default deleting of every artifact.

Archive Process
The 'archive' process performs the following:

Grabs all of the currently set properties on the artifact
Does a deploy over top of the artifact, to conserve space
Adds all of the previously held attributes to the newly deployed artifact
Moves the artifact from the source repository to the destination repository specified
Adds a property containing the archive timestamp to the artifact