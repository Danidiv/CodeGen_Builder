/**
 * Preview error messages are often too vague for a small model to act on.
 * This adds a short, concrete hint about the usual cause.
 */
export function errorHint(error: string): string {
  if (/Element type is invalid/i.test(error)) {
    return (
      "A component is undefined. Likely causes: (1) an icon imported from lucide-react that does not exist " +
      "(lucide-react has NO brand icons such as Instagram, Facebook, Twitter, Youtube, Github, Linkedin; " +
      "use Camera, Share2, Globe, Mail, Phone or MapPin instead), (2) a component imported with the wrong " +
      "style (default vs named import), or (3) a component whose file was not returned. " +
      "Check every import in every file."
    );
  }
  if (/is not defined/i.test(error)) {
    return "Something is used but never defined or imported. Define it in the file or import it.";
  }
  if (/Could not find (dependency|module)|Cannot find module/i.test(error)) {
    return "Only react, react-dom, lucide-react and framer-motion are installed. Remove or replace any other import.";
  }
  return "";
}
